extends Node

signal game_started

const PORT_NUMBER := 18818
const MAX_PEERS := 16

var peer := ENetMultiplayerPeer.new()
var player_info: Dictionary = {}
var lobbies: Dictionary = {}      # lobby_code → [peer_id]
var is_server := false
var is_connected := false

var player_id: int = 0

func _ready():
	_connect_signals()
	if OS.has_feature("server"):
		# Running as a dedicated server (e.g. via `--server` flag)
		is_server = true
		player_id = 0
		peer.create_server(PORT_NUMBER, MAX_PEERS)
		multiplayer.multiplayer_peer = peer
		print("Server running on port %d" % PORT_NUMBER)
	else:
		# Client will now connect to nick.hackclub.app
		var server_address := "nick.hackclub.app"
		peer.create_client(server_address, PORT_NUMBER)
		multiplayer.multiplayer_peer = peer
		print("Client connecting to %s:%d…" % [server_address, PORT_NUMBER])

func _connect_signals():
	multiplayer.peer_connected.connect(_on_player_connected)
	multiplayer.peer_disconnected.connect(_on_player_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_ok)
	multiplayer.connection_failed.connect(_on_connected_fail)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

#── SERVER RPC: join or create lobby by code ──#
@rpc("authority")
func join_lobby(code: String) -> void:
	var pid = multiplayer.get_remote_sender_id()
	if not lobbies.has(code):
		lobbies[code] = []
	if pid not in lobbies[code]:
		lobbies[code].append(pid)
	_broadcast_lobby_update(code)

func _broadcast_lobby_update(code: String) -> void:
	var members = lobbies[code]
	for pid in members:
		rpc_id(pid, "update_lobby_list", code, members)

#── CLIENT RPC: receive updated member list ──#
@rpc("any_peer")
func update_lobby_list(code: String, members: Array) -> void:
	print("Lobby '%s' now has peers: %s" % [code, members])

#── CONNECTION SIGNALS ──#
func _on_player_connected(pid: int) -> void:
	if is_server:
		# register basic info
		player_info[pid] = {"name": "Player_%d" % pid}
		rpc_id(pid, "register_player", player_info[pid])
		print("Player %d joined; sent registration" % pid)

func _on_player_disconnected(pid: int) -> void:
	# remove from all lobbies, broadcast updates
	for code in lobbies.keys():
		if pid in lobbies[code]:
			lobbies[code].erase(pid)
			_broadcast_lobby_update(code)
	player_info.erase(pid)
	print("Player %d disconnected" % pid)

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

#── OPTIONAL: register self info ──#
@rpc("any_peer")
func register_player(info: Dictionary) -> void:
	var pid = multiplayer.get_remote_sender_id()
	player_info[pid] = info
	print("Registered player %d info: %s" % [pid, info])
