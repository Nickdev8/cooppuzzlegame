extends Node

signal connected_to_server
signal disconnected_from_server
signal player_cursor_received(player_id, x, y)

var server_url: String = "wss://iotservice.nl:3080"
var lobby_code: String = "GLOBAL"
var is_connected: bool = false
var websocket: WebSocketPeer
var my_player_id: String

func _ready():
	print("[SimpleNetwork] Starting simple network manager")
	websocket = WebSocketPeer.new()
	
	# Get lobby info from parent window
	if OS.has_feature("web") and Engine.has_singleton("JavaScript"):
		var js = Engine.get_singleton("JavaScript")
		var lobby_info = js.eval("window.godot_lobby_info")
		if lobby_info and lobby_info.has("lobbyCode"):
			lobby_code = lobby_info.lobbyCode
			if lobby_info.has("serverUrl"):
				server_url = lobby_info.serverUrl
			print("[SimpleNetwork] Got lobby info: ", lobby_info)
	
	# Connect to server
	connect_to_server()

func connect_to_server():
	print("[SimpleNetwork] Connecting to: ", server_url)
	var error = websocket.connect_to_url(server_url)
	if error != OK:
		print("[SimpleNetwork] Failed to connect: ", error)
		return
	
	# Generate a simple player ID
	my_player_id = str(randi()) + "_" + str(Time.get_unix_time_from_system())
	print("[SimpleNetwork] My player ID: ", my_player_id)

func _process(_delta):
	if websocket:
		websocket.poll()
		
		var state = websocket.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			if not is_connected:
				print("[SimpleNetwork] ✅ Connected!")
				is_connected = true
				emit_signal("connected_to_server")
			
			# Send mouse position
			var mouse_pos = get_viewport().get_mouse_position()
			send_mouse_position(mouse_pos.x, mouse_pos.y)
			
			# Check for incoming messages
			while websocket.get_available_packet_count() > 0:
				var packet = websocket.get_packet()
				var message = packet.get_string_from_utf8()
				handle_message(message)
				
		elif state == WebSocketPeer.STATE_CLOSED:
			if is_connected:
				print("[SimpleNetwork] ❌ Disconnected")
				is_connected = false
				emit_signal("disconnected_from_server")

func send_mouse_position(x: float, y: float):
	if is_connected:
		var data = {
			"type": "mouse",
			"player_id": my_player_id,
			"lobby": lobby_code,
			"x": x,
			"y": y
		}
		var message = JSON.stringify(data)
		var packet = message.to_utf8_buffer()
		websocket.send(packet)

func handle_message(message: String):
	var data = JSON.parse_string(message)
	if data and data.has("type"):
		match data.type:
			"mouse":
				var player_id = data.get("player_id", "")
				if player_id != my_player_id:
					var x = data.get("x", 0)
					var y = data.get("y", 0)
					emit_signal("player_cursor_received", player_id, x, y)
			"joined":
				print("[SimpleNetwork] Player joined: ", data.get("player_id", ""))
			"left":
				print("[SimpleNetwork] Player left: ", data.get("player_id", ""))
	else:
		print("[SimpleNetwork] Unknown message: ", message) 