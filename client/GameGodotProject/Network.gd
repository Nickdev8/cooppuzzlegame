extends Node

signal game_started

const MAX_PEER_COUNT = 4

var port_number: int = 18818
var target_peer_count: int = 4
var ip_address: String = "127.0.0.1"

var peer := ENetMultiplayerPeer.new()
var player_info: Dictionary = {}
var is_server: bool = false
var connection_count: int = 0
var upnp: UPNP = UPNP.new()
var player_name: String = "Player"

func _ready():
	if OS.has_feature("server") or OS.get_name() == "Server":
		print("Running in headless server mode")
		host_game()

func _connect_signals() -> void:
	multiplayer.peer_connected.connect(_on_player_connected)
	multiplayer.peer_disconnected.connect(_on_player_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_ok)
	multiplayer.connection_failed.connect(_on_connected_fail)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

func host_game(host_online := false) -> void:
	is_server = true
	peer.create_server(port_number, MAX_PEER_COUNT)
	multiplayer.multiplayer_peer = peer
	print_debug("Server started on port %d" % port_number)
	
	if host_online:
		set_up_upnp()

func set_up_upnp() -> void:
	upnp.discover()
	if upnp.get_gateway() and upnp.get_gateway().is_valid_gateway():
		var result = upnp.add_port_mapping(port_number, port_number, ProjectSettings.get_setting("application/config/name"), "UDP")
		if result == OK:
			print("UPNP port forwarding successful")
		else:
			print("UPNP port forwarding failed")

func join_game() -> void:
	is_server = false
	peer.create_client(ip_address, port_number)
	multiplayer.multiplayer_peer = peer
	print_debug("Client connecting to %s:%d" % [ip_address, port_number])

@rpc("any_peer")
func register_player(player_information: Dictionary) -> void:
	var peer_id = multiplayer.get_remote_sender_id()
	player_info[peer_id] = player_information
	print_debug("Registered player: %s" % player_information)

func start_game() -> void:
	if is_server:
		rpc("client_start_game")
		emit_signal("game_started")

@rpc("any_peer")
func client_start_game() -> void:
	emit_signal("game_started")

func _on_player_connected(player_id: int) -> void:
	print_debug("player " +  str(player_id) + " joined")
	if is_server:
		connection_count += 1
		var info = {"player_name": "Player_%d" % player_id}
		player_info[player_id] = info
		rpc_id(player_id, "register_player", info)

		if connection_count >= target_peer_count:
			start_game()

func _on_player_disconnected(player_id: int) -> void:
	print_debug("Player disconnected: %d" % player_id)
	player_info.erase(player_id)

func _on_connected_ok() -> void:
	print_debug("Successfully connected to server")

func _on_connected_fail() -> void:
	print_debug("Failed to connect to server")

func _on_server_disconnected() -> void:
	print_debug("Disconnected from server")
