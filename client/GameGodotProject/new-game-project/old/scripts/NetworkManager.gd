extends Node

signal connected_to_server
signal disconnected_from_server
signal level_info_received(level_info)
signal level_changed(level_data)
signal player_update_received(player_data)
signal object_interaction_received(interaction_data)
signal player_disconnected(player_id)

var server_url: String = "ws://localhost:3080"
var lobby_code: String = "GLOBAL"
var is_connected: bool = false
var lobby_info_received: bool = false
var socket_io_connected: bool = false

# WebRTC variables
var peer_connections: Dictionary = {}
var local_peer_id: String = ""
var signaling_socket: WebSocketPeer
var data_channels: Dictionary = {}

func _ready():
	# Listen for messages from parent window (only in web builds)
	if OS.has_feature("web"):
		# JavaScript.eval is only available in web exports
		if Engine.has_singleton("JavaScript"):
			var js = Engine.get_singleton("JavaScript")
			js.eval("""
				window.addEventListener('message', function(event) {
					if (event.data && event.data.type === 'LOBBY_INFO') {
						window.godot_lobby_info = event.data;
					}
				});
			""")
	
	# Connect UI signals
	var connect_button = get_node("../UI/ConnectionPanel/VBoxContainer/ConnectButton")
	connect_button.pressed.connect(_on_connect_button_pressed)
	
	var skip_button = get_node("../GameUI/SkipButton")
	skip_button.pressed.connect(_on_skip_button_pressed)
	
	# Check for lobby info from parent window (only in web builds)
	if OS.has_feature("web"):
		_check_for_lobby_info()
	else:
		# For non-web platforms, show connection UI
		var connection_panel = get_node("../UI/ConnectionPanel")
		if connection_panel:
			connection_panel.visible = true

func _check_for_lobby_info():
	if OS.has_feature("web") and Engine.has_singleton("JavaScript"):
		var js = Engine.get_singleton("JavaScript")
		# Check if lobby info is available from parent window
		var lobby_info = js.eval("window.godot_lobby_info")
		if lobby_info and lobby_info.has("lobbyCode"):
			_lobby_info_received(lobby_info)
		else:
			# Try again after a short delay
			await get_tree().create_timer(0.5).timeout
			_check_for_lobby_info()

func _lobby_info_received(info: Dictionary):
	if lobby_info_received:
		return
		
	lobby_info_received = true
	
	# Update server URL and lobby code
	if info.has("serverUrl"):
		server_url = info.serverUrl
	if info.has("lobbyCode"):
		lobby_code = info.lobbyCode
	
	print("Received lobby info: ", info)
	print("Connecting to server: ", server_url)
	print("Joining lobby: ", lobby_code)
	
	# Connect to the server immediately
	connect_to_server()

func _on_connect_button_pressed():
	var server_input = get_node("../UI/ConnectionPanel/VBoxContainer/ServerInput")
	if server_input.text != "":
		server_url = server_input.text
	
	connect_to_server()

func connect_to_server():
	if OS.has_feature("web") and Engine.has_singleton("JavaScript"):
		var js = Engine.get_singleton("JavaScript")
		
		# Convert WebSocket URL to Socket.IO URL for signaling
		var socket_io_url = server_url
		if socket_io_url.begins_with("wss://"):
			socket_io_url = socket_io_url.replace("wss://", "https://")
		elif socket_io_url.begins_with("ws://"):
			socket_io_url = socket_io_url.replace("ws://", "http://")
		
		# Remove any trailing /socket.io/ path since Socket.IO client will add it
		if socket_io_url.ends_with("/socket.io/"):
			socket_io_url = socket_io_url.replace("/socket.io/", "/")
		elif socket_io_url.ends_with("/socket.io"):
			socket_io_url = socket_io_url.replace("/socket.io", "/")
		
		# Ensure we have a trailing slash for the base URL
		if not socket_io_url.ends_with("/"):
			socket_io_url += "/"
		
		print("[NetworkManager] Connecting to WebRTC signaling server: ", socket_io_url)
		print("[NetworkManager] Lobby code: ", lobby_code)
		
		# Load Socket.IO client for signaling and setup WebRTC
		js.eval("""
			console.log('Setting up WebRTC connection...');
			
			// Load Socket.IO client if not already loaded
			if (!window.io) {
				console.log('Loading Socket.IO client for signaling...');
				var script = document.createElement('script');
				script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
				script.onload = function() {
					console.log('Socket.IO client loaded successfully');
					window.godot_socket_io_ready = true;
					window.godot_setup_webrtc();
				};
				script.onerror = function() {
					console.error('Failed to load Socket.IO client');
				};
				document.head.appendChild(script);
			} else {
				console.log('Socket.IO client already loaded');
				window.godot_socket_io_ready = true;
				window.godot_setup_webrtc();
			}
			
			// WebRTC configuration
			window.godot_webrtc_config = {
				iceServers: [
					{ urls: 'stun:stun.l.google.com:19302' },
					{ urls: 'stun:stun1.l.google.com:19302' }
				]
			};
			
			window.godot_peer_connections = {};
			window.godot_data_channels = {};
			window.godot_local_peer_id = '';
			
			// Function to setup WebRTC
			window.godot_setup_webrtc = function() {
				if (!window.io) {
					console.error('Socket.IO not available');
					return;
				}
				
				try {
					console.log('Creating Socket.IO connection for signaling: """ + socket_io_url + """');
					window.godot_signaling_socket = io('""" + socket_io_url + """', {
						transports: ['websocket', 'polling'],
						timeout: 20000,
						forceNew: true,
						path: '/socket.io/'
					});
					
					window.godot_signaling_socket.on('connect', function() {
						console.log('✅ Connected to signaling server');
						window.godot_signaling_socket.emit('joinPhysics', { lobby: '""" + lobby_code + """' });
					});
					
					window.godot_signaling_socket.on('joinedPhysics', function(data) {
						console.log('✅ Joined physics lobby:', data);
					});
					
					window.godot_signaling_socket.on('playersInLobby', function(playerIds) {
						console.log('👥 Players in lobby:', playerIds);
						// Create WebRTC connections to other players
						playerIds.forEach(function(playerId) {
							window.godot_create_peer_connection(playerId);
						});
					});
					
					window.godot_signaling_socket.on('levelInfo', function(data) {
						console.log('📋 Level info received:', data);
						window.godot_level_info = data;
					});
					
					window.godot_signaling_socket.on('levelChanged', function(data) {
						console.log('🔄 Level changed:', data);
						window.godot_level_changed = data;
					});
					
					window.godot_signaling_socket.on('playerUpdate', function(data) {
						console.log('👤 Player update received:', data);
						window.godot_player_update = data;
					});
					
					window.godot_signaling_socket.on('objectInteraction', function(data) {
						console.log('🎯 Object interaction received:', data);
						window.godot_object_interaction = data;
					});
					
					window.godot_signaling_socket.on('playerDisconnected', function(data) {
						console.log('👋 Player disconnected:', data);
						window.godot_player_disconnected = data;
					});
					
					// WebRTC signaling events
					window.godot_signaling_socket.on('webrtc-offer', function(data) {
						console.log('📤 Received WebRTC offer from:', data.from);
						window.godot_handle_webrtc_offer(data.from, data.offer);
					});
					
					window.godot_signaling_socket.on('webrtc-answer', function(data) {
						console.log('📥 Received WebRTC answer from:', data.from);
						window.godot_handle_webrtc_answer(data.from, data.answer);
					});
					
					window.godot_signaling_socket.on('webrtc-ice-candidate', function(data) {
						console.log('🧊 Received ICE candidate from:', data.from);
						window.godot_handle_ice_candidate(data.from, data.candidate);
					});
					
				} catch (error) {
					console.error('❌ Error creating signaling connection:', error);
				}
			};
			
			// Create WebRTC peer connection
			window.godot_create_peer_connection = function(peerId) {
				if (window.godot_peer_connections[peerId]) {
					return; // Already exists
				}
				
				console.log('🔗 Creating WebRTC connection to:', peerId);
				
				var pc = new RTCPeerConnection(window.godot_webrtc_config);
				window.godot_peer_connections[peerId] = pc;
				
				// Create data channel
				var dataChannel = pc.createDataChannel('gameData', {
					ordered: true,
					maxRetransmits: 3
				});
				
				window.godot_data_channels[peerId] = dataChannel;
				
				dataChannel.onopen = function() {
					console.log('✅ Data channel opened with:', peerId);
				};
				
				dataChannel.onmessage = function(event) {
					console.log('📨 Received data from:', peerId, event.data);
					try {
						var data = JSON.parse(event.data);
						window.godot_webrtc_message = data;
					} catch (e) {
						console.error('Failed to parse WebRTC message:', e);
					}
				};
				
				dataChannel.onclose = function() {
					console.log('❌ Data channel closed with:', peerId);
					delete window.godot_data_channels[peerId];
				};
				
				// ICE candidate handling
				pc.onicecandidate = function(event) {
					if (event.candidate) {
						console.log('🧊 Sending ICE candidate to:', peerId);
						window.godot_signaling_socket.emit('webrtc-ice-candidate', {
							to: peerId,
							candidate: event.candidate
						});
					}
				};
				
				// Create and send offer
				pc.createOffer().then(function(offer) {
					return pc.setLocalDescription(offer);
				}).then(function() {
					console.log('📤 Sending offer to:', peerId);
					window.godot_signaling_socket.emit('webrtc-offer', {
						to: peerId,
						offer: pc.localDescription
					});
				}).catch(function(error) {
					console.error('Error creating offer:', error);
				});
			};
			
			// Handle incoming WebRTC offer
			window.godot_handle_webrtc_offer = function(fromPeerId, offer) {
				console.log('📥 Handling offer from:', fromPeerId);
				
				var pc = new RTCPeerConnection(window.godot_webrtc_config);
				window.godot_peer_connections[fromPeerId] = pc;
				
				// Handle incoming data channel
				pc.ondatachannel = function(event) {
					var dataChannel = event.channel;
					window.godot_data_channels[fromPeerId] = dataChannel;
					
					dataChannel.onopen = function() {
						console.log('✅ Data channel opened with:', fromPeerId);
					};
					
					dataChannel.onmessage = function(event) {
						console.log('📨 Received data from:', fromPeerId, event.data);
						try {
							var data = JSON.parse(event.data);
							window.godot_webrtc_message = data;
						} catch (e) {
							console.error('Failed to parse WebRTC message:', e);
						}
					};
					
					dataChannel.onclose = function() {
						console.log('❌ Data channel closed with:', fromPeerId);
						delete window.godot_data_channels[fromPeerId];
					};
				};
				
				// ICE candidate handling
				pc.onicecandidate = function(event) {
					if (event.candidate) {
						console.log('🧊 Sending ICE candidate to:', fromPeerId);
						window.godot_signaling_socket.emit('webrtc-ice-candidate', {
							to: fromPeerId,
							candidate: event.candidate
						});
					}
				};
				
				// Set remote description and create answer
				pc.setRemoteDescription(new RTCSessionDescription(offer)).then(function() {
					return pc.createAnswer();
				}).then(function(answer) {
					return pc.setLocalDescription(answer);
				}).then(function() {
					console.log('📤 Sending answer to:', fromPeerId);
					window.godot_signaling_socket.emit('webrtc-answer', {
						to: fromPeerId,
						answer: pc.localDescription
					});
				}).catch(function(error) {
					console.error('Error handling offer:', error);
				});
			};
			
			// Handle incoming WebRTC answer
			window.godot_handle_webrtc_answer = function(fromPeerId, answer) {
				console.log('📥 Handling answer from:', fromPeerId);
				var pc = window.godot_peer_connections[fromPeerId];
				if (pc) {
					pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(function(error) {
						console.error('Error setting remote description:', error);
					});
				}
			};
			
			// Handle incoming ICE candidate
			window.godot_handle_ice_candidate = function(fromPeerId, candidate) {
				console.log('🧊 Handling ICE candidate from:', fromPeerId);
				var pc = window.godot_peer_connections[fromPeerId];
				if (pc) {
					pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function(error) {
						console.error('Error adding ICE candidate:', error);
					});
				}
			};
			
			// Function to send data via WebRTC
			window.godot_send_webrtc_data = function(data) {
				var message = JSON.stringify(data);
				Object.keys(window.godot_data_channels).forEach(function(peerId) {
					var dataChannel = window.godot_data_channels[peerId];
					if (dataChannel.readyState === 'open') {
						dataChannel.send(message);
					}
				});
			};
			
		""")
		
		socket_io_connected = true
		is_connected = true
		print("[NetworkManager] WebRTC connection initiated")
		emit_signal("connected_to_server")
	else:
		print("[NetworkManager] WebRTC not available in non-web builds")

func _process(_delta):
	if OS.has_feature("web") and Engine.has_singleton("JavaScript") and socket_io_connected:
		var js = Engine.get_singleton("JavaScript")
		
		# Check for new messages from signaling server
		var level_info = js.eval("window.godot_level_info")
		if level_info:
			js.eval("window.godot_level_info = null")
			emit_signal("level_info_received", level_info)
		
		var level_changed = js.eval("window.godot_level_changed")
		if level_changed:
			js.eval("window.godot_level_changed = null")
			emit_signal("level_changed", level_changed)
		
		var player_update = js.eval("window.godot_player_update")
		if player_update:
			js.eval("window.godot_player_update = null")
			print("[NetworkManager] Player update received: ", player_update)
			emit_signal("player_update_received", player_update)
		
		var object_interaction = js.eval("window.godot_object_interaction")
		if object_interaction:
			js.eval("window.godot_object_interaction = null")
			print("[NetworkManager] Object interaction received: ", object_interaction)
			emit_signal("object_interaction_received", object_interaction)
		
		var player_disconnected = js.eval("window.godot_player_disconnected")
		if player_disconnected:
			js.eval("window.godot_player_disconnected = null")
			print("[NetworkManager] Player disconnected: ", player_disconnected.id)
			emit_signal("player_disconnected", player_disconnected.id)
		
		# Check for WebRTC messages
		var webrtc_message = js.eval("window.godot_webrtc_message")
		if webrtc_message:
			js.eval("window.godot_webrtc_message = null")
			_handle_webrtc_message(webrtc_message)

func _handle_webrtc_message(data: Dictionary):
	# Handle different types of WebRTC messages
	if data.has("type"):
		match data.type:
			"playerUpdate":
				emit_signal("player_update_received", data.data)
			"objectInteraction":
				emit_signal("object_interaction_received", data.data)
			"levelComplete":
				# Handle level complete from peer
				pass

func _send_message(event: String, data: Dictionary):
	if OS.has_feature("web") and Engine.has_singleton("JavaScript") and socket_io_connected:
		var js = Engine.get_singleton("JavaScript")
		
		# Send via signaling server for server-managed events
		if event in ["levelComplete", "skipLevel"]:
			js.eval("""
				if (window.godot_signaling_socket && window.godot_signaling_socket.connected) {
					window.godot_signaling_socket.emit('""" + event + """', """ + JSON.stringify(data) + """);
				}
			""")
		else:
			# Send via WebRTC for player updates and object interactions
			var webrtc_data = {
				"type": event,
				"data": data
			}
			js.eval("""
				if (window.godot_send_webrtc_data) {
					window.godot_send_webrtc_data(""" + JSON.stringify(webrtc_data) + """);
				}
			""")
		
		print("[NetworkManager] Sending message: ", event, data)

func send_player_update(data: Dictionary):
	# Add local cursor position to data
	if Input:
		var mouse_pos = get_viewport().get_mouse_position()
		data["cursor_position"] = {"x": mouse_pos.x, "y": mouse_pos.y}
	print("[NetworkManager] Sending player update: ", data)
	_send_message("playerUpdate", data)

func send_object_interaction(data: Dictionary):
	print("[NetworkManager] Sending object interaction: ", data)
	_send_message("objectInteraction", data)

func send_level_complete():
	print("[NetworkManager] Sending level complete")
	_send_message("levelComplete", {})

func _on_skip_button_pressed():
	print("[NetworkManager] Skip level pressed")
	_send_message("skipLevel", {})

func disconnect_from_server():
	if OS.has_feature("web") and Engine.has_singleton("JavaScript"):
		var js = Engine.get_singleton("JavaScript")
		js.eval("""
			// Close all WebRTC connections
			Object.keys(window.godot_peer_connections).forEach(function(peerId) {
				var pc = window.godot_peer_connections[peerId];
				pc.close();
			});
			window.godot_peer_connections = {};
			window.godot_data_channels = {};
			
			// Close signaling connection
			if (window.godot_signaling_socket) {
				window.godot_signaling_socket.disconnect();
				window.godot_signaling_socket = null;
			}
		""")
		print("[NetworkManager] Disconnected from WebRTC server")
		socket_io_connected = false
		is_connected = false 
