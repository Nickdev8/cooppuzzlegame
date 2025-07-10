extends Button


func _on_button_down() -> void:
	Network.print_everyone.rpc("test clicked on" + str(Network.player_id))
