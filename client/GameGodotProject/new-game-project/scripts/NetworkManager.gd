extends Node

signal connected_to_server
signal disconnected_from_server
signal level_info_received(level_info)
signal level_changed(level_data)
signal player_update_received(player_data)
signal object_interaction_received(interaction_data)
signal player_disconnected(player_id)

var websocket: WebSocketPeer
var server_url: String = "ws://localhost:3080"
var lobby_code: String = "GLOBAL"
var is_connected: bool = false
var lobby_info_received: bool = false

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
	
	# Automatically connect to the server
	connect_to_server()

func _on_connect_button_pressed():
	var server_input = get_node("../UI/ConnectionPanel/VBoxContainer/ServerInput")
	if server_input.text != "":
		server_url = server_input.text
	
	connect_to_server()

func connect_to_server():
	if websocket:
		websocket.close()
	
	websocket = WebSocketPeer.new()
	var error = websocket.connect_to_url(server_url)
	if error != OK:
		print("Failed to connect to server: ", error)
		return
	
	print("Connecting to server: ", server_url)

func _process(_delta):
	if websocket:
		websocket.poll()
		
		var state = websocket.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			if not is_connected:
				is_connected = true
				print("Connected to server!")
				emit_signal("connected_to_server")
				_join_lobby()
			
			while websocket.get_available_packet_count():
				var packet = websocket.get_packet()
				var data = JSON.parse_string(packet.get_string_from_utf8())
				if data:
					_handle_server_message(data)
					
		elif state == WebSocketPeer.STATE_CLOSED:
			if is_connected:
				is_connected = false
				print("Disconnected from server")
				emit_signal("disconnected_from_server")

func _join_lobby():
	var join_data = {
		"lobby": lobby_code
	}
	_send_message("joinPhysics", join_data)

func _handle_server_message(data):
	if data.has("type"):
		match data.type:
			"joinedPhysics":
				print("Joined physics lobby")
			"levelInfo":
				emit_signal("level_info_received", data)
			"levelChanged":
				emit_signal("level_changed", data)
			"playerUpdate":
				emit_signal("player_update_received", data)
			"objectInteraction":
				emit_signal("object_interaction_received", data)
			"playerDisconnected":
				emit_signal("player_disconnected", data.id)
	else:
		# Handle direct message types
		if data.has("currentLevel"):
			emit_signal("level_info_received", data)

func _send_message(event: String, data: Dictionary):
	if websocket and websocket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var message = {
			"event": event,
			"data": data
		}
		var json_string = JSON.stringify(message)
		websocket.send_text(json_string)

func send_player_update(data: Dictionary):
	_send_message("playerUpdate", data)

func send_object_interaction(data: Dictionary):
	_send_message("objectInteraction", data)

func send_level_complete():
	_send_message("levelComplete", {})

func _on_skip_button_pressed():
	_send_message("skipLevel", {})

func disconnect_from_server():
	if websocket:
		websocket.close()
		is_connected = false 