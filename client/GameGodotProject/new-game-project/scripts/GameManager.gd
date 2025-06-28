extends Node

var network_manager: Node
var cursor_texture: Texture2D = preload("res://assets/cursor.svg")
var player_cursors: Dictionary = {}

func _ready():
	print("[SimpleGame] Starting simple game manager")
	network_manager = get_node("../NetworkManager")
	
	# Connect network signals
	network_manager.connected_to_server.connect(_on_connected_to_server)
	network_manager.disconnected_from_server.connect(_on_disconnected_from_server)
	network_manager.player_cursor_received.connect(_on_player_cursor_received)
	
	# Create a simple background
	_create_background()

func _create_background():
	# Create a simple colored background
	var background = ColorRect.new()
	background.color = Color(0.2, 0.3, 0.4)  # Dark blue-gray
	background.size = get_viewport().size
	background.position = Vector2.ZERO
	add_child(background)
	
	# Add some text
	var label = Label.new()
	label.text = "Simple Multiplayer Cursor Test\nMove your mouse to see other players!"
	label.position = Vector2(50, 50)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_font_size_override("font_size", 24)
	add_child(label)

func _on_connected_to_server():
	print("[SimpleGame] Connected to server!")

func _on_disconnected_from_server():
	print("[SimpleGame] Disconnected from server!")
	# Clear all cursors when disconnected
	for cursor in player_cursors.values():
		if is_instance_valid(cursor):
			cursor.queue_free()
	player_cursors.clear()

func _on_player_cursor_received(player_id: String, x: float, y: float):
	print("[SimpleGame] Player ", player_id, " cursor at: ", x, ", ", y)
	
	# Create or update cursor for this player
	var cursor_node: Sprite2D = null
	if player_cursors.has(player_id):
		cursor_node = player_cursors[player_id]
	else:
		cursor_node = Sprite2D.new()
		cursor_node.texture = cursor_texture
		cursor_node.name = "Cursor_" + player_id
		cursor_node.z_index = 1000
		cursor_node.modulate = Color(randf(), randf(), randf())  # Random color per player
		add_child(cursor_node)
		player_cursors[player_id] = cursor_node
		print("[SimpleGame] Created cursor for player: ", player_id)
	
	# Update cursor position
	cursor_node.position = Vector2(x, y)
	cursor_node.visible = true 