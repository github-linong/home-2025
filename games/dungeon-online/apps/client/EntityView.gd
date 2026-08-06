# EntityView.gd — visual for one entity. Renders interpolated position, hp bar, status
# tint, and the D / telegraph warning indicator when the snapshot carries `telegraph`.
#
# Delivered for REVIEW ONLY — no Godot binary in the build sandbox, cannot be executed.
#
# DESIGN GAP (O / D): sim-core EntityState declares `telegraph?: TelegraphState`, but
# world.ts `snapshot()` does NOT populate it today (see production/client-slice-plan.md).
# So `_show_telegraph()` is fully wired but currently never fires — the server must fill
# `entity.telegraph` before the client can render the danger cue. Likewise the E8
# shield/taunt runtime state is never serialized into EntityState, so it cannot be drawn.

extends Node2D

enum Kind { PLAYER, ENEMY, BOSS, RESOURCE, PROJECTILE, TELEGRAPH }
enum TelegraphShape { RING, AOE_FILL, CONE, LINE }
# EntityStatus bits (sim-core types.ts): ALIVE=1, DOWNED=2, OUT=4, DEAD=8,
# IFRAME=16, STUN=32, SLOW=64, BUFF=128.

var entity_id: int = -1
var kind: int = 0

var _body: Node2D
var _hp_fg: ColorRect
var _telegraph: Node2D
var _kind_color := Color(0.3, 0.6, 1.0)


func _ready() -> void:
	_body = Node2D.new()
	_body.name = "Body"
	var rect := ColorRect.new()
	rect.size = Vector2(28, 28)
	rect.position = Vector2(-14, -14)
	_body.add_child(rect)
	add_child(_body)

	var hp := Node2D.new()
	hp.name = "HpBar"
	var bg := ColorRect.new()
	bg.size = Vector2(28, 4)
	bg.position = Vector2(-14, -22)
	bg.color = Color(0.15, 0.15, 0.15)
	_hp_fg = ColorRect.new()
	_hp_fg.size = Vector2(28, 4)
	_hp_fg.position = Vector2(-14, -22)
	_hp_fg.color = Color(0.2, 0.9, 0.3)
	hp.add_child(bg)
	hp.add_child(_hp_fg)
	add_child(hp)

	_telegraph = Node2D.new()
	_telegraph.name = "Telegraph"
	_telegraph.visible = false
	var tc := ColorRect.new()
	tc.size = Vector2(64, 64)
	tc.position = Vector2(-32, -32)
	tc.color = Color(1.0, 0.2, 0.2, 0.35)
	_telegraph.add_child(tc)
	add_child(_telegraph)

	_apply_kind_color()


func apply_state(pos: Vector2, state: Dictionary, _alpha: float) -> void:
	position = pos

	var hp: float = float(state.get("hp", 0))
	var max_hp: float = float(state.get("maxHp", 1))
	_hp_fg.scale.x = clampf(hp / max(max_hp, 1.0), 0.0, 1.0)

	_apply_status(int(state.get("status", 1)))

	# D / telegraph visual hook (inactive until server populates entity.telegraph).
	var tg: Variant = state.get("telegraph", null)
	if typeof(tg) == TYPE_DICTIONARY and not tg.is_empty():
		_show_telegraph(tg)
	else:
		_hide_telegraph()


func _apply_kind_color() -> void:
	match kind:
		Kind.ENEMY:
			_kind_color = Color(0.9, 0.4, 0.3)
		Kind.BOSS:
			_kind_color = Color(0.9, 0.2, 0.5)
		Kind.RESOURCE:
			_kind_color = Color(0.4, 0.9, 0.5)
		_:
			_kind_color = Color(0.3, 0.6, 1.0)
	if _body != null and _body.get_child_count() > 0:
		var rect := _body.get_child(0) as ColorRect
		if rect != null:
			rect.color = _kind_color


func _apply_status(status: int) -> void:
	if status & 2:            # DOWNED
		_body.modulate = Color(1.0, 0.45, 0.45)
	elif status & 4:         # OUT (spectating this run)
		_body.modulate = Color(0.4, 0.4, 0.4)
	elif status & 16:        # IFRAME (dodge)
		_body.modulate = Color(0.7, 0.9, 1.0)
	else:
		_body.modulate = Color(1.0, 1.0, 1.0)


func _show_telegraph(tg: Dictionary) -> void:
	_telegraph.visible = true
	var radius: float = float(tg.get("radius", 32.0))
	_telegraph.scale = Vector2(radius / 32.0, radius / 32.0)
	# shape/color drive the warning graphic style; this is purely a visual cue and
	# never affects gameplay state.


func _hide_telegraph() -> void:
	_telegraph.visible = false
