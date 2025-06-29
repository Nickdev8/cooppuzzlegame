extends Node2D

var multiplayer_peer = ENetMultiplayerPeer.new()

const PORT = 1

func _process(delta: float) -> void:
	print("Im Running!")
	if (multiplayer.is_server()):
		printToAll("hi!")
	
@rpc("unreliable_ordered","any_peer")
func printToAll(message: String):
	print(message)
