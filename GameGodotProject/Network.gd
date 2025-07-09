extends Node
signal game_started

const PORT_NUMBER := 18818
const MAX_PEERS := 16

var multiplayer_peer: MultiplayerPeer
var is_server := false
var is_connected := false
var player_id := -1
var player_info: Dictionary = {}  # keep track of joined players

func _ready():
	_connect_signals()

	if OS.has_feature("server"):
		# SERVER
		is_server = true
		player_id = 0
		multiplayer_peer = ENetMultiplayerPeer.new()
		multiplayer_peer.create_server(PORT_NUMBER, MAX_PEERS)
		print("Server running on port %d" % PORT_NUMBER)
	else:
		# CLIENT (HTML5 → WebSocket; desktop → ENet)
		if OS.has_feature("html5"):
			multiplayer_peer = WebSocketMultiplayerPeer.new()
			await multiplayer_peer.create_client("wss://nick.hackclub.app:%d" % PORT_NUMBER)
		else:
			multiplayer_peer = ENetMultiplayerPeer.new()
			multiplayer_peer.create_client("nick.hackclub.app", PORT_NUMBER)
			
		print("Client connecting to %s:%d…" % ["nick.hackclub.app", PORT_NUMBER])

	multiplayer.multiplayer_peer = multiplayer_peer

func _connect_signals():
	multiplayer.peer_connected.connect(_on_player_connected)
	multiplayer.peer_disconnected.connect(_on_player_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_ok)
	multiplayer.connection_failed.connect(_on_connected_fail)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

func _on_player_connected(pid: int) -> void:
	if is_server:
		# server-side registration
		player_info[pid] = {"name": "Player_%d" % pid}
		rpc_id(pid, "register_player", player_info[pid])
		print("Player %d joined; sent registration" % pid)
		# broadcast a "player joined" notice to everyone
		rpc("player_joined", pid)

func _on_player_disconnected(pid: int) -> void:
	# simply remove from our registry and notify
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

#── OPTIONAL: register self info ──#
@rpc("any_peer")
func register_player(info: Dictionary) -> void:
	var pid = multiplayer.get_remote_sender_id()
	player_info[pid] = info
	print("Registered player %d info: %s" % [pid, info])

#── CLIENT RPCs: show join/leave locally ──#
@rpc("any_peer")
func player_joined(pid: int) -> void:
	print("Player %d has joined the game!" % pid)

@rpc("any_peer")
func player_left(pid: int) -> void:
	print("Player %d has left the game." % pid)
