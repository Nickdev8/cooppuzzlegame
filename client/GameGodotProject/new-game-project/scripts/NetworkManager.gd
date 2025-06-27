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
	
	# For now, just print the info without connecting
	print("[NetworkManager] Lobby info received, but not connecting yet for testing")
	
	# Automatically connect to the server after a delay
	await get_tree().create_timer(3.0).timeout
	connect_to_server()

func _on_connect_button_pressed():
	var server_input = get_node("../UI/ConnectionPanel/VBoxContainer/ServerInput")
	if server_input.text != "":
		server_url = server_input.text
	
	connect_to_server()

func connect_to_server():
	if OS.has_feature("web") and Engine.has_singleton("JavaScript"):
		var js = Engine.get_singleton("JavaScript")
		
		# Convert WebSocket URL to Socket.IO URL
		var socket_io_url = server_url
		if socket_io_url.begins_with("wss://"):
			socket_io_url = socket_io_url.replace("wss://", "https://")
		elif socket_io_url.begins_with("ws://"):
			socket_io_url = socket_io_url.replace("ws://", "http://")
		
		# Remove the /socket.io/ path since Socket.IO client will add it
		if socket_io_url.ends_with("/socket.io/"):
			socket_io_url = socket_io_url.replace("/socket.io/", "/")
		
		print("[NetworkManager] Connecting to Socket.IO server: ", socket_io_url)
		
		# Load Socket.IO client and connect
		js.eval("""
			// Load Socket.IO client
			if (!window.io) {
				var script = document.createElement('script');
				script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
				script.onload = function() {
					window.godot_socket_io_ready = true;
				};
				document.head.appendChild(script);
			} else {
				window.godot_socket_io_ready = true;
			}
		""")
		
		# Wait for Socket.IO to load and then connect
		await get_tree().create_timer(1.0).timeout
		
		js.eval("""
			if (window.godot_socket_io_ready && !window.godot_socket) {
				window.godot_socket = io('""" + socket_io_url + """', {
					transports: ['websocket', 'polling']
				});
				
				window.godot_socket.on('connect', function() {
					console.log('Connected to Socket.IO server');
					window.godot_socket_connected = true;
					window.godot_socket.emit('joinPhysics', { lobby: '""" + lobby_code + """' });
				});
				
				window.godot_socket.on('disconnect', function() {
					console.log('Disconnected from Socket.IO server');
					window.godot_socket_connected = false;
				});
				
				window.godot_socket.on('joinedPhysics', function(data) {
					console.log('Joined physics lobby:', data);
				});
				
				window.godot_socket.on('levelInfo', function(data) {
					console.log('Level info received:', data);
					window.godot_level_info = data;
				});
				
				window.godot_socket.on('levelChanged', function(data) {
					console.log('Level changed:', data);
					window.godot_level_changed = data;
				});
				
				window.godot_socket.on('playerUpdate', function(data) {
					console.log('Player update received:', data);
					window.godot_player_update = data;
				});
				
				window.godot_socket.on('objectInteraction', function(data) {
					console.log('Object interaction received:', data);
					window.godot_object_interaction = data;
				});
				
				window.godot_socket.on('playerDisconnected', function(data) {
					console.log('Player disconnected:', data);
					window.godot_player_disconnected = data;
				});
			}
		""")
		
		socket_io_connected = true
		is_connected = true
		print("[NetworkManager] Socket.IO connection initiated")
		emit_signal("connected_to_server")
	else:
		print("[NetworkManager] Socket.IO not available in non-web builds")

func _process(_delta):
	if OS.has_feature("web") and Engine.has_singleton("JavaScript") and socket_io_connected:
		var js = Engine.get_singleton("JavaScript")
		
		# Check for new messages from Socket.IO
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

func _send_message(event: String, data: Dictionary):
	if OS.has_feature("web") and Engine.has_singleton("JavaScript") and socket_io_connected:
		var js = Engine.get_singleton("JavaScript")
		js.eval("""
			if (window.godot_socket && window.godot_socket_connected) {
				window.godot_socket.emit('""" + event + """', """ + JSON.stringify(data) + """);
			}
		""")
		print("[NetworkManager] Sending message: ", event, data)

func send_player_update(data: Dictionary):
	# Add local cursor position to data
	if Input:
		data["cursor_position"] = {"x": Input.get_mouse_position().x, "y": Input.get_mouse_position().y}
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
			if (window.godot_socket) {
				window.godot_socket.disconnect();
				window.godot_socket = null;
				window.godot_socket_connected = false;
			}
		""")
		print("[NetworkManager] Disconnected from Socket.IO server")
		socket_io_connected = false
		is_connected = false 