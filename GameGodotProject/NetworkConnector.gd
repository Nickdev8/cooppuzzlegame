extends Node

@onready var lobby_join_main: VBoxContainer = %lobby_join_main
@onready var code: TextEdit = $Control/lobby_join_main/code

func _ready() -> void:
	var validCharacters = "QWERTYUIOPASDFGHJKLZXCVBNM"
	var randomCode = ""
	var codeLengnt = randi_range(5,7)
	
	for i in codeLengnt:
		randomCode = randomCode + validCharacters[randi_range(0, validCharacters.length())]
	
	print(randomCode)
	code.text = randomCode

func _on_join_button_down() -> void:
	print("joining lobby: " + code.text)
	Network.join_lobby(code.text)
