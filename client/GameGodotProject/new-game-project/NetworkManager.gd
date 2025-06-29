extends Node2D

func _ready():
	if OS.has_feature("web"):
		# Run JS code directly and return the result
		var level = JavaScriptBridge.eval("""
			// Create a URLSearchParams object for window.location.search
			new URLSearchParams(window.location.search).get('level')
		""")
		print("Level param:", level)
