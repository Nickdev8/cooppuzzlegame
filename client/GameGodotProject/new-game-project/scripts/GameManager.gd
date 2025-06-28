extends Node

signal level_loaded(level_data)
signal level_completed
signal game_state_changed(new_state)

var current_level: int = 0
var level_data: Dictionary = {}
var game_state: String = "playing"
var players: Dictionary = {}
var game_objects: Dictionary = {}
var game_ball: RigidBody2D
var goal: Area2D

var network_manager: Node

# Preload textures
var ball_texture: Texture2D
var box_texture: Texture2D
var cursor_texture: Texture2D = preload("res://assets/cursor.svg")
var player_cursors: Dictionary = {}

# Dictionary to hold remote player cursor nodes
var remote_cursors: Dictionary = {}

func _ready():
	print("[GameManager] _ready() called")
	network_manager = get_node("../NetworkManager")
	
	# Load textures
	ball_texture = preload("res://assets/ball.png")
	box_texture = preload("res://assets/box.png")
	
	# Connect network signals
	network_manager.connected_to_server.connect(_on_connected_to_server)
	network_manager.disconnected_from_server.connect(_on_disconnected_from_server)
	network_manager.level_info_received.connect(_on_level_info_received)
	network_manager.level_changed.connect(_on_level_changed)
	network_manager.player_update_received.connect(_on_player_update_received)
	network_manager.object_interaction_received.connect(_on_object_interaction_received)
	network_manager.player_disconnected.connect(_on_player_disconnected)
	
	# Handle UI visibility based on platform
	_setup_ui_for_platform()

func _setup_ui_for_platform():
	var connection_panel = get_node("../UI/ConnectionPanel")
	var game_ui = get_node("../GameUI")
	
	if OS.has_feature("web"):
		# In web builds, hide connection panel initially (will be shown if no lobby info)
		if connection_panel:
			connection_panel.visible = false
		if game_ui:
			game_ui.visible = false
	else:
		# In non-web builds, show connection panel for manual connection
		if connection_panel:
			connection_panel.visible = true
		if game_ui:
			game_ui.visible = false

func _on_connected_to_server():
	print("[GameManager] Connected to server")
	# Show game UI
	var connection_panel = get_node("../UI/ConnectionPanel")
	var game_ui = get_node("../GameUI")
	
	if connection_panel:
		connection_panel.visible = false
	if game_ui:
		game_ui.visible = true
	
	# Update status
	var status_label = get_node("../UI/ConnectionPanel/VBoxContainer/StatusLabel")
	if status_label:
		status_label.text = "Connected"
	
	# Join the lobby
	network_manager.join_lobby()

func _on_disconnected_from_server():
	print("[GameManager] Disconnected from server")
	# Show connection UI
	var connection_panel = get_node("../UI/ConnectionPanel")
	var game_ui = get_node("../GameUI")
	
	if connection_panel:
		connection_panel.visible = true
	if game_ui:
		game_ui.visible = false
	
	# Update status
	var status_label = get_node("../UI/ConnectionPanel/VBoxContainer/StatusLabel")
	if status_label:
		status_label.text = "Disconnected"
	
	# Clear game state
	_clear_level()

func _on_level_info_received(level_info: Dictionary):
	print("[GameManager] Level info received: ", level_info)
	current_level = level_info.get("currentLevel", 0)
	level_data = level_info.get("levelData", {})
	game_state = level_info.get("gameState", "playing")
	
	_load_level(level_data)
	
	# Update UI
	var level_info_label = get_node("../GameUI/LevelInfo")
	if level_info_label:
		level_info_label.text = "Level: " + str(current_level + 1)
	
	emit_signal("level_loaded", level_data)
	emit_signal("game_state_changed", game_state)

func _on_level_changed(level_data: Dictionary):
	print("[GameManager] Level changed: ", level_data)
	_on_level_info_received(level_data)

func _on_player_update_received(player_data: Dictionary):
	var player_id = player_data.get("id", "")
	print("[GameManager] Received player update for id=", player_id, ": ", player_data)
	if player_id != "" and player_id != network_manager.player_id:
		players[player_id] = player_data
		_update_player_visual(player_id, player_data)
	else:
		print("[GameManager] Ignoring local player update or missing id.")

func _on_object_interaction_received(interaction_data: Dictionary):
	print("[GameManager] Object interaction received: ", interaction_data)
	var player_id = interaction_data.get("playerId", "")
	var object_id = interaction_data.get("objectId", "")
	var interaction_type = interaction_data.get("type", "")
	
	match interaction_type:
		"grab":
			_handle_object_grab(player_id, object_id, interaction_data)
		"release":
			_handle_object_release(player_id, object_id, interaction_data)
		"activate":
			_handle_object_activate(player_id, object_id, interaction_data)

func _on_player_disconnected(player_id: String):
	print("[GameManager] Player disconnected: ", player_id)
	if players.has(player_id):
		players.erase(player_id)
		_remove_player_visual(player_id)

func _load_level(level_data: Dictionary):
	print("[GameManager] Loading level: ", level_data)
	_clear_level()
	
	if level_data.is_empty():
		return
	
	print("Loading level: ", level_data.get("name", "Unknown"))
	
	# Create game ball
	_create_game_ball(level_data.get("ballStartLocation", {"x": 100, "y": 100}))
	
	# Create goal
	_create_goal(level_data.get("goalLocation", {"x": 700, "y": 500}))
	
	# Create static objects
	var objects = level_data.get("objects", [])
	for obj in objects:
		_create_static_object(obj)
	
	# Create grabbable objects
	var grabbable_objects = level_data.get("grabbableObjects", [])
	for obj in grabbable_objects:
		_create_grabbable_object(obj)

func _clear_level():
	print("[GameManager] Clearing level")
	# Remove all game objects
	for obj in game_objects.values():
		if is_instance_valid(obj):
			obj.queue_free()
	game_objects.clear()
	
	# Remove game ball and goal
	if is_instance_valid(game_ball):
		game_ball.queue_free()
		game_ball = null
	
	if is_instance_valid(goal):
		goal.queue_free()
		goal = null

func _create_game_ball(start_position: Dictionary):
	print("[GameManager] Creating game ball at ", start_position)
	game_ball = RigidBody2D.new()
	game_ball.position = Vector2(start_position.x, start_position.y)
	
	var collision_shape = CollisionShape2D.new()
	var circle_shape = CircleShape2D.new()
	circle_shape.radius = 15
	collision_shape.shape = circle_shape
	game_ball.add_child(collision_shape)
	
	var sprite = Sprite2D.new()
	sprite.texture = ball_texture
	sprite.scale = Vector2(30.0 / ball_texture.get_width(), 30.0 / ball_texture.get_height())
	game_ball.add_child(sprite)
	
	add_child(game_ball)
	game_objects["gameBall"] = game_ball

func _create_goal(goal_position: Dictionary):
	print("[GameManager] Creating goal at ", goal_position)
	goal = Area2D.new()
	goal.position = Vector2(goal_position.x, goal_position.y)
	
	var collision_shape = CollisionShape2D.new()
	var circle_shape = CircleShape2D.new()
	circle_shape.radius = 25
	collision_shape.shape = circle_shape
	goal.add_child(collision_shape)
	
	var sprite = Sprite2D.new()
	# Create a simple goal sprite (green circle)
	sprite.modulate = Color.GREEN
	var goal_texture = _create_circle_texture(50, Color.GREEN)
	sprite.texture = goal_texture
	goal.add_child(sprite)
	
	goal.body_entered.connect(_on_goal_entered)
	add_child(goal)

func _create_static_object(obj_data: Dictionary):
	print("[GameManager] Creating static object: ", obj_data)
	var static_body = StaticBody2D.new()
	static_body.position = Vector2(obj_data.x, obj_data.y)
	
	var collision_shape = CollisionShape2D.new()
	
	match obj_data.get("shape", "rectangle"):
		"rectangle":
			var rect_shape = RectangleShape2D.new()
			rect_shape.size = Vector2(obj_data.width, obj_data.height)
			collision_shape.shape = rect_shape
		"circle":
			var circle_shape = CircleShape2D.new()
			circle_shape.radius = obj_data.radius
			collision_shape.shape = circle_shape
	
	static_body.add_child(collision_shape)
	
	var sprite = Sprite2D.new()
	# Use box texture for static objects
	sprite.texture = box_texture
	if obj_data.has("width") and obj_data.has("height"):
		sprite.scale = Vector2(obj_data.width / box_texture.get_width(), obj_data.height / box_texture.get_height())
	sprite.modulate = Color.GRAY
	static_body.add_child(sprite)
	
	add_child(static_body)
	game_objects[obj_data.id] = static_body

func _create_grabbable_object(obj_data: Dictionary):
	print("[GameManager] Creating grabbable object: ", obj_data)
	var rigid_body = RigidBody2D.new()
	rigid_body.position = Vector2(obj_data.x, obj_data.y)
	rigid_body.mass = obj_data.get("mass", 1.0)
	
	var collision_shape = CollisionShape2D.new()
	
	match obj_data.get("shape", "rectangle"):
		"rectangle":
			var rect_shape = RectangleShape2D.new()
			rect_shape.size = Vector2(obj_data.width, obj_data.height)
			collision_shape.shape = rect_shape
		"circle":
			var circle_shape = CircleShape2D.new()
			circle_shape.radius = obj_data.radius
			collision_shape.shape = circle_shape
	
	rigid_body.add_child(collision_shape)
	
	var sprite = Sprite2D.new()
	# Use box texture for grabbable objects
	sprite.texture = box_texture
	if obj_data.has("width") and obj_data.has("height"):
		sprite.scale = Vector2(obj_data.width / box_texture.get_width(), obj_data.height / box_texture.get_height())
	sprite.modulate = Color.ORANGE
	rigid_body.add_child(sprite)
	
	# Store respawn location
	rigid_body.set_meta("respawn_location", obj_data.get("respawnLocation", {"x": obj_data.x, "y": obj_data.y}))
	
	add_child(rigid_body)
	game_objects[obj_data.id] = rigid_body

func _create_circle_texture(size: int, color: Color) -> Texture2D:
	var image = Image.create(size, size, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	
	var center = Vector2(size / 2, size / 2)
	var radius = size / 2 - 2
	
	for x in range(size):
		for y in range(size):
			var pos = Vector2(x, y)
			var distance = pos.distance_to(center)
			if distance <= radius:
				image.set_pixel(x, y, color)
	
	var texture = ImageTexture.create_from_image(image)
	return texture

func _on_goal_entered(body: Node2D):
	print("[GameManager] Goal entered by: ", body)
	if body == game_ball:
		print("Goal reached! Level complete!")
		network_manager.send_level_complete()
		emit_signal("level_completed")

func _handle_object_grab(player_id: String, object_id: String, data: Dictionary):
	print("[GameManager] Object grabbed: ", object_id, " by ", player_id, " data: ", data)
	if game_objects.has(object_id):
		var obj = game_objects[object_id]
		if obj is RigidBody2D:
			obj.freeze = true
			obj.set_meta("grabbed_by", player_id)

func _handle_object_release(player_id: String, object_id: String, data: Dictionary):
	print("[GameManager] Object released: ", object_id, " by ", player_id, " data: ", data)
	if game_objects.has(object_id):
		var obj = game_objects[object_id]
		if obj is RigidBody2D:
			obj.freeze = false
			obj.erase_meta("grabbed_by")
			
			# Apply velocity if provided
			if data.has("velocity"):
				var velocity = data.velocity
				obj.linear_velocity = Vector2(velocity.x, velocity.y)

func _handle_object_activate(player_id: String, object_id: String, data: Dictionary):
	print("[GameManager] Object activated: ", object_id, " by ", player_id, " data: ", data)
	# Handle object activation (switches, flippers, etc.)
	pass

func _update_player_visual(player_id: String, player_data: Dictionary):
	print("[GameManager] Updating player visual for id=", player_id, ": ", player_data)
	var pos = Vector2(player_data.get("x", 0), player_data.get("y", 0))
	var cursor_node: Sprite2D = null
	if player_cursors.has(player_id):
		cursor_node = player_cursors[player_id]
	else:
		cursor_node = Sprite2D.new()
		cursor_node.texture = cursor_texture
		cursor_node.name = "Cursor_" + player_id
		cursor_node.z_index = 1000
		add_child(cursor_node)
		player_cursors[player_id] = cursor_node
	cursor_node.position = pos
	cursor_node.visible = true
	print("[GameManager] Cursor for player ", player_id, " set to position ", pos)

func _remove_player_visual(player_id: String):
	print("[GameManager] Removing player visual for id=", player_id)
	if player_cursors.has(player_id):
		var cursor_node = player_cursors[player_id]
		if is_instance_valid(cursor_node):
			cursor_node.queue_free()
		player_cursors.erase(player_id)

func _input(event):
	print("[GameManager] Input event: ", event)
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_handle_mouse_click(event.position)
			else:
				_handle_mouse_release(event.position)

func _handle_mouse_click(position: Vector2):
	print("[GameManager] Mouse click at ", position)
	# Check if clicking on a grabbable object
	for obj_id in game_objects:
		var obj = game_objects[obj_id]
		if obj is RigidBody2D:
			var distance = obj.position.distance_to(position)
			if distance < 50:  # Simple distance check
				network_manager.send_object_interaction({
					"type": "grab",
					"objectId": obj_id,
					"position": {"x": position.x, "y": position.y}
				})
				break

func _handle_mouse_release(position: Vector2):
	print("[GameManager] Mouse release at ", position)
	# Release any grabbed object
	for obj_id in game_objects:
		var obj = game_objects[obj_id]
		if obj is RigidBody2D and obj.has_meta("grabbed_by"):
			network_manager.send_object_interaction({
				"type": "release",
				"objectId": obj_id,
				"position": {"x": position.x, "y": position.y}
			})
			break 

func _process(_delta):
	# Send player updates if connected
	if network_manager.is_connected:
		var mouse_pos = get_viewport().get_mouse_position()
		network_manager.send_player_update({
			"id": network_manager.player_id,
			"x": mouse_pos.x,
			"y": mouse_pos.y
		}) 