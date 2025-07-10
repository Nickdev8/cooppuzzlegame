extends Node
signal game_started

const PORT_NUMBER := 39973
const MAX_PEERS := 16

var multiplayer_peer: ENetMultiplayerPeer
var is_server := false
var is_connected := false
var player_id := -1
var player_info: Dictionary = {}  # track joined players

func _ready() -> void:
	_connect_signals()
	multiplayer_peer = ENetMultiplayerPeer.new()

	if OS.has_feature("server"):
		# ─── SERVER ───────────────────────────
		is_server = true
		player_id = 0
		multiplayer_peer.create_server(PORT_NUMBER, MAX_PEERS)
		print("Server running on port %d" % PORT_NUMBER)
	else:
		# ─── CLIENT ───────────────────────────
		multiplayer_peer.create_client("nick.hackclub.app", PORT_NUMBER)
		print("Client connecting to nick.hackclub.app:%d…" % PORT_NUMBER)

	multiplayer.multiplayer_peer = multiplayer_peer

func _connect_signals() -> void:
	multiplayer.peer_connected.connect(_on_player_connected)
	multiplayer.peer_disconnected.connect(_on_player_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_ok)
	multiplayer.connection_failed.connect(_on_connected_fail)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

func _on_player_connected(pid: int) -> void:
	if is_server:
		player_info[pid] = {"name": "Player_%d" % pid}
		rpc_id(pid, "register_player", player_info[pid])
		print("Player %d joined; sent registration" % pid)
		rpc("player_joined", pid)

func _on_player_disconnected(pid: int) -> void:
	player_info.erase(pid)
	print("Player %d disconnected" % pid)
	rpc("player_left", pid)

func _on_connected_ok(remote_id: int) -> void:
	is_connected = true
	player_id = multiplayer.get_unique_id()
	print("Connected as ID %d" % player_id)

func _on_connected_fail() -> void:
	is_connected = false
	print("Connection failed")

func _on_server_disconnected() -> void:
	is_connected = false
	print("Server disconnected")

@rpc("any_peer")
func register_player(info: Dictionary) -> void:
	var pid = multiplayer.get_remote_sender_id()
	player_info[pid] = info
	print("Registered player %d info: %s" % [pid, info])

@rpc("any_peer")
func player_joined(pid: int) -> void:
	print("Player %d has joined the game!" % pid)

@rpc("any_peer")
func player_left(pid: int) -> void:
	print("Player %d has left the game." % pid)

@rpc("any_peer")
func print_everyone(message: String):
	if is_connected:
		print(message)
