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
var websocket_connected: bool = false
var websocket: WebSocketClient

func _ready():
	# Initialize WebSocket client
	websocket = WebSocketClient.new()
	websocket.connect("connection_established", _on_connection_established)
	websocket.connect("connection_closed", _on_connection_closed)
	websocket.connect("connection_error", _on_connection_error)
	websocket.connect("data_received", _on_data_received)
	
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
	print("[NetworkManager] Connecting to WebSocket server: ", server_url)
	print("[NetworkManager] Lobby code: ", lobby_code)
	
	# Connect to WebSocket server
	var error = websocket.connect_to_url(server_url)
	if error != OK:
		print("[NetworkManager] Failed to connect to WebSocket server: ", error)
		return
	
	websocket_connected = true
	is_connected = true
	print("[NetworkManager] WebSocket connection initiated")

func _on_connection_established(protocol: String):
	print("[NetworkManager] ✅ Connected to WebSocket server")
	emit_signal("connected_to_server")
	
	# Join the physics lobby
	var join_message = {
		"type": "joinPhysics",
		"lobby": lobby_code
	}
	_send_message(join_message)

func _on_connection_closed(was_clean_close: bool):
	print("[NetworkManager] ❌ Disconnected from WebSocket server")
	websocket_connected = false
	is_connected = false
	emit_signal("disconnected_from_server")

func _on_connection_error():
	print("[NetworkManager] ❌ WebSocket connection error")
	websocket_connected = false
	is_connected = false
	emit_signal("disconnected_from_server")

func _on_data_received():
	var packet = websocket.get_peer(1).get_packet()
	var message = packet.get_string_from_utf8()
	
	var data = JSON.parse_string(message)
	if data and data.has("type"):
		_handle_message(data)
	else:
		print("[NetworkManager] Error parsing message: ", message)

func _handle_message(data: Dictionary):
	var message_type = data.get("type", "")
	var message_data = data.get("data", {})
	
	match message_type:
		"joinedPhysics":
			print("[NetworkManager] ✅ Joined physics lobby")
		"levelInfo":
			print("[NetworkManager] 📋 Level info received: ", message_data)
			emit_signal("level_info_received", message_data)
		"levelChanged":
			print("[NetworkManager] 🔄 Level changed: ", message_data)
			emit_signal("level_changed", message_data)
		"playerUpdate":
			print("[NetworkManager] 👤 Player update received: ", message_data)
			emit_signal("player_update_received", message_data)
		"objectInteraction":
			print("[NetworkManager] 🎯 Object interaction received: ", message_data)
			emit_signal("object_interaction_received", message_data)
		"playerDisconnected":
			print("[NetworkManager] 👋 Player disconnected: ", message_data.get("id", ""))
			emit_signal("player_disconnected", message_data.get("id", ""))

func _process(_delta):
	if websocket_connected:
		websocket.poll()

func _send_message(data: Dictionary):
	if websocket_connected and websocket.get_connection_status() == WebSocketClient.CONNECTION_CONNECTED:
		var message = JSON.stringify(data)
		var packet = message.to_utf8_buffer()
		websocket.get_peer(1).put_packet(packet)
		print("[NetworkManager] Sending message: ", data)

func send_player_update(data: Dictionary):
	# Add local cursor position to data
	if Input:
		var mouse_pos = get_viewport().get_mouse_position()
		data["cursor_position"] = {"x": mouse_pos.x, "y": mouse_pos.y}
	print("[NetworkManager] Sending player update: ", data)
	_send_message({
		"type": "playerUpdate",
		"data": data
	})

func send_object_interaction(data: Dictionary):
	print("[NetworkManager] Sending object interaction: ", data)
	_send_message({
		"type": "objectInteraction",
		"data": data
	})

func send_level_complete():
	print("[NetworkManager] Sending level complete")
	_send_message({
		"type": "levelComplete",
		"data": {}
	})

func _on_skip_button_pressed():
	print("[NetworkManager] Skip level pressed")
	_send_message({
		"type": "skipLevel",
		"data": {}
	})

func disconnect_from_server():
	if websocket_connected:
		websocket.disconnect_from_host()
		print("[NetworkManager] Disconnected from WebSocket server")
		websocket_connected = false
		is_connected = false 