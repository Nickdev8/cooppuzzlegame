extends Node

signal connected_to_server
signal disconnected_from_server
signal level_info_received(level_info)
signal level_changed(level_data)
signal player_update_received(player_data)
signal object_interaction_received(interaction_data)
signal player_disconnected(player_id)

var server_url: String = "ws://localhost:9001"
var lobby_code: String = "GLOBAL"
var player_id: String = ""
var is_connected: bool = false
var lobby_info_received: bool = false
var ws: WebSocketPeer

func _ready():
	# Generate a unique player ID
	player_id = str(randi())
	
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
	# Create WebSocket connection
	ws = WebSocketPeer.new()
	var error = ws.connect_to_url(server_url)
	
	if error != OK:
		print("[NetworkManager] Failed to connect to WebSocket server: ", error)
		return
	
	print("[NetworkManager] Connecting to WebSocket server: ", server_url)
	print("[NetworkManager] Player ID: ", player_id)
	print("[NetworkManager] Lobby code: ", lobby_code)
	
	is_connected = true

func _process(_delta):
	if ws and is_connected:
		ws.poll()
		
		var state = ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			# Handle incoming messages
			while ws.get_available_packet_count() > 0:
				var packet = ws.get_packet()
				var message = packet.get_string_from_utf8()
				
				try:
					var data = JSON.parse_string(message)
					_handle_message(data)
				except:
					print("[NetworkManager] Failed to parse message: ", message)
					
		elif state == WebSocketPeer.STATE_CLOSED:
			print("[NetworkManager] WebSocket connection closed")
			is_connected = false
			emit_signal("disconnected_from_server")

func _handle_message(data: Dictionary):
	if not data.has("type"):
		return
		
	match data.type:
		"levelInfo":
			print("[NetworkManager] Level info received: ", data)
			emit_signal("level_info_received", data)
			
		"levelChanged":
			print("[NetworkManager] Level changed: ", data)
			emit_signal("level_changed", data)
			
		"gameState":
			print("[NetworkManager] Game state received: ", data)
			# Handle initial game state with all players
			if data.has("players"):
				for player_data in data.players:
					if player_data.has("id") and player_data.id != player_id:
						emit_signal("player_update_received", player_data)
			
		"playerUpdate":
			print("[NetworkManager] Player update received: ", data)
			if data.has("playerId") and data.playerId != player_id:
				emit_signal("player_update_received", data.playerData)
			
		"objectInteraction":
			print("[NetworkManager] Object interaction received: ", data)
			if data.has("playerId") and data.playerId != player_id:
				emit_signal("object_interaction_received", data.interactionData)
			
		"playerDisconnected":
			print("[NetworkManager] Player disconnected: ", data.playerId)
			emit_signal("player_disconnected", data.playerId)

func _send_message(type: String, data: Dictionary = {}):
	if ws and is_connected and ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var message = {
			"type": type
		}
		message.merge(data)
		
		var json_string = JSON.stringify(message)
		var packet = json_string.to_utf8_buffer()
		ws.put_packet(packet)
		print("[NetworkManager] Sending message: ", type, data)

func join_lobby():
	_send_message("join", {
		"playerId": player_id,
		"lobbyCode": lobby_code
	})

func send_player_update(data: Dictionary):
	# Add local cursor position to data
	if Input:
		var mouse_pos = get_viewport().get_mouse_position()
		data["cursor_position"] = {"x": mouse_pos.x, "y": mouse_pos.y}
	
	_send_message("playerUpdate", {
		"playerData": data
	})

func send_object_interaction(data: Dictionary):
	_send_message("objectInteraction", {
		"interactionData": data
	})

func send_level_complete():
	_send_message("levelComplete")

func _on_skip_button_pressed():
	_send_message("skipLevel")

func disconnect_from_server():
	if ws:
		ws.close()
		is_connected = false
		print("[NetworkManager] Disconnected from WebSocket server")

func _exit_tree():
	disconnect_from_server() 