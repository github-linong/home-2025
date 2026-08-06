# EntityView.gd — visual for one entity. Renders interpolated position, hp bar, status
# tint, the D / telegraph warning indicator (fixed full-extent outline always visible at
# full radius + fill that grows 0.35→1.0 inside it, CONE/LINE oriented by attacker facing),
# and E8 co-op skill visuals (shield overlay in ally faction color, taunt marker, brief
# EMBER cast bar).
#
# All visuals are recomputed every snapshot tick from snapshot fields ONLY — they are
# never authored locally (Discipline B: client renders, the server owns state). Stale
# overlays cannot linger because apply_state() is called every render frame with the
# freshest interpolated entity state and explicitly hides each visual when its snapshot
# field is absent/expired.
#
# Delivered for REVIEW ONLY — no Godot binary in the build sandbox, cannot be executed.

extends Node2D

enum Kind { PLAYER, ENEMY, BOSS, RESOURCE, PROJECTILE, TELEGRAPH }
enum TelegraphShape { RING, AOE_FILL, CONE, LINE }
# EntityStatus bits (sim-core types.ts): ALIVE=1, DOWNED=2, OUT=4, DEAD=8,
# IFRAME=16, STUN=32, SLOW=64, BUFF=128.

var entity_id: int = -1
var kind: int = 0

var _body: Node2D
var _hp_fg: ColorRect
var _kind_color := Color(0.3, 0.6, 1.0)

# A3 visual nodes
var _telegraph: Node2D
var _tg_fill: Polygon2D
var _tg_outline: Line2D
var _shield_viz: Node2D
var _shield_ring: Line2D
var _shield_fill: Polygon2D
var _taunt_viz: Node2D
var _taunt_mark: Polygon2D
var _cast_viz: Node2D
var _cast_fg: ColorRect

# Brief cast-bar animation state (retrigger when the co-op skill id changes).
var _last_active_skill: Variant = null
var _cast_show_until_ms: int = 0
const CAST_VFX_MS := 600  # how long the cast bar lingers after a co-op skill fires

# ── Palette (art-bible §3) — fixed on-palette values chosen for art-director ratification (M2) ──
const DANGER_COLOR_V := Color(0.898, 0.282, 0.302)  # DANGER #E5484D (aligned from off-palette (1,0.2,0.2))
const EMBER_COLOR_V := Color(0.910, 0.573, 0.235)   # EMBER #E8923C — co-op skill VFX
# Shielded-ally identity tints (seat % 4 → faction). (M2)
const FACTION_TINTS := [
	Color(0.298, 0.710, 0.961),  # P1 蔚蓝 #4CB5F5
	Color(0.608, 0.482, 0.910),  # P2 紫罗兰 #9B7BE8
	Color(0.910, 0.435, 0.690),  # P3 品红 #E86FB0
	Color(0.435, 0.839, 0.541),  # P4 春绿 #6FD68A
]
const SHIELD_FALLBACK_TINT := Color(0.957, 0.788, 0.365)  # GOLD #F4C95D (no ownerId → safe on-palette default)


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

	# ── D / telegraph (danger indicator) ──
	_telegraph = Node2D.new()
	_telegraph.name = "Telegraph"
	_telegraph.visible = false
	_tg_fill = Polygon2D.new()
	_tg_fill.name = "Fill"
	_tg_outline = Line2D.new()
	_tg_outline.name = "Outline"
	_tg_outline.width = 3.0
	_tg_outline.closed = true
	_telegraph.add_child(_tg_fill)
	_telegraph.add_child(_tg_outline)
	add_child(_telegraph)

	# ── E8 SHIELD_ALLY overlay (cyan ring + soft fill on the shielded player) ──
	_shield_viz = Node2D.new()
	_shield_viz.name = "ShieldViz"
	_shield_viz.visible = false
	_shield_fill = Polygon2D.new()
	_shield_fill.name = "Fill"
	_shield_fill.polygon = _circle_points(20.0, 24)
	_shield_fill.color = Color(FACTION_TINTS[0].r, FACTION_TINTS[0].g, FACTION_TINTS[0].b, 0.18)
	_shield_ring = Line2D.new()
	_shield_ring.name = "Ring"
	_shield_ring.points = _circle_points(22.0, 24)
	_shield_ring.closed = true
	_shield_ring.width = 3.0
	_shield_ring.default_color = Color(FACTION_TINTS[0].r, FACTION_TINTS[0].g, FACTION_TINTS[0].b, 0.95)
	_shield_viz.add_child(_shield_fill)
	_shield_viz.add_child(_shield_ring)
	add_child(_shield_viz)

	# ── E8 TAUNT marker (yellow triangle above the taunting player's head) ──
	_taunt_viz = Node2D.new()
	_taunt_viz.name = "TauntViz"
	_taunt_viz.visible = false
	_taunt_mark = Polygon2D.new()
	_taunt_mark.name = "Mark"
	_taunt_mark.polygon = PackedVector2Array([Vector2(0, -34), Vector2(-7, -44), Vector2(7, -44)])
	_taunt_mark.color = Color(1.0, 0.85, 0.2, 0.95)
	_taunt_viz.add_child(_taunt_mark)
	add_child(_taunt_viz)

	# ── E8 co-op cast bar (brief flash when activeSkill fires) ──
	_cast_viz = Node2D.new()
	_cast_viz.name = "CastViz"
	_cast_viz.visible = false
	var cast_bg := ColorRect.new()
	cast_bg.size = Vector2(30, 5)
	cast_bg.position = Vector2(-15, -30)
	cast_bg.color = Color(0.1, 0.1, 0.1, 0.7)
	_cast_fg = ColorRect.new()
	_cast_fg.size = Vector2(30, 5)
	_cast_fg.position = Vector2(-15, -30)
	_cast_fg.color = Color(EMBER_COLOR_V.r, EMBER_COLOR_V.g, EMBER_COLOR_V.b, 0.95)
	_cast_viz.add_child(cast_bg)
	_cast_viz.add_child(_cast_fg)
	add_child(_cast_viz)

	_apply_kind_color()


# Recomputed every render frame from the freshest interpolated entity state.
func apply_state(pos: Vector2, state: Dictionary, _alpha: float, render_tick: float) -> void:
	position = pos

	var hp: float = float(state.get("hp", 0))
	var max_hp: float = float(state.get("maxHp", 1))
	_hp_fg.scale.x = clampf(hp / max(max_hp, 1.0), 0.0, 1.0)

	_apply_status(int(state.get("status", 1)))

	# D / telegraph visual — recomputed every tick from snapshot.telegraph.
	var tg: Variant = state.get("telegraph", null)
	if typeof(tg) == TYPE_DICTIONARY and not tg.is_empty():
		_show_telegraph(tg, render_tick)
	else:
		_hide_telegraph()

	# E8 co-op skill visuals — all data-driven from snapshot fields.
	_update_skill_visuals(state, render_tick)


func _update_skill_visuals(state: Dictionary, render_tick: float) -> void:
	# Shield active: shieldUntilTick > now (authoritative tick estimate).
	var su: Variant = state.get("shieldUntilTick", null)
	var shielded := (typeof(su) == TYPE_INT or typeof(su) == TYPE_FLOAT) and int(su) > int(render_tick)
	_shield_viz.visible = shielded
	if shielded:
		# M2: shield ring/fill use the SHIELDED ALLY's faction color (ownerId%4 → palette),
		# not a hard-coded off-palette cyan (art-bible §3 / ⑨ §7). Color is re-derived every
		# frame from snapshot.ownerId, so it stays data-driven (Discipline B).
		var tint := _faction_tint(state.get("ownerId", null))
		_shield_ring.default_color = Color(tint.r, tint.g, tint.b, 0.95)
		_shield_fill.color = Color(tint.r, tint.g, tint.b, 0.18)

	# Taunt active: tauntUntilTick > now (the taunting player draws the marker).
	var tu: Variant = state.get("tauntUntilTick", null)
	var taunting := (typeof(tu) == TYPE_INT or typeof(tu) == TYPE_FLOAT) and int(tu) > int(render_tick)
	_taunt_viz.visible = taunting

	# activeSkill != null → brief cast bar; retrigger the animation when the skill id changes.
	var asv: Variant = state.get("activeSkill", null)
	if asv != null:
		if _last_active_skill != asv:
			_last_active_skill = asv
			_cast_show_until_ms = Time.get_ticks_msec() + CAST_VFX_MS
		var remain := _cast_show_until_ms - Time.get_ticks_msec()
		if remain > 0:
			_cast_viz.visible = true
			_cast_fg.scale.x = clampf(float(remain) / CAST_VFX_MS, 0.0, 1.0)
		else:
			_cast_viz.visible = false
	else:
		_last_active_skill = null
		_cast_viz.visible = false


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


# Renders the danger indicator (P3 static-readable tell):
#  - FIXED full-extent OUTLINE at full radius, always visible (low constant alpha) → the
#    true danger radius is readable from frame 1 (M1 readability fix).
#  - FILL GROWS (scale 0.35→1.0) INSIDE the fixed outline → "charge" toward applyTick.
#  - End-brightening: outline alpha bumps as progress→1 (imminent).
#  - Edge pulse: the whole indicator briefly expands in the last ~150ms before applyTick.
#  - Orientation (N2): CONE apex / LINE long-axis rotate along attacker facing `dir`
#    (unit vector from snapshot); RING/AOE_FILL ignore dir (radially symmetric).
func _show_telegraph(tg: Dictionary, render_tick: float) -> void:
	_telegraph.visible = true
	var elapsed := render_tick - float(tg.get("startTick", 0))
	var window := max(1.0, float(tg.get("applyTick", 0)) - float(tg.get("startTick", 0)))
	var progress := clampf(elapsed / window, 0.0, 1.0)

	var radius: float = float(tg.get("radius", 32.0))
	var color := _telegraph_color(int(tg.get("color", 0)))
	# Geometry is authored pointing +x; orientation is applied via node rotation (N2).
	var geo := _telegraph_geometry(int(tg.get("shape", 0)), radius)

	# ── Orientation (N2) ──
	var dir: Variant = tg.get("dir", null)
	if typeof(dir) == TYPE_DICTIONARY and dir.has("x") and dir.has("y"):
		_telegraph.rotation = atan2(float(dir.get("y", 0.0)), float(dir.get("x", 1.0)))
	else:
		_telegraph.rotation = 0.0

	# ── Fixed full-extent outline (M1): always at full radius, low constant alpha,
	#    with a late "imminent" brightening near applyTick. ──
	_tg_outline.points = geo
	var imminent := clampf((progress - 0.75) / 0.25, 0.0, 1.0)  # 0 until last 25%, →1 at applyTick
	_tg_outline.default_color = Color(color.r, color.g, color.b, lerpf(0.32, 0.95, imminent))

	# ── Fill grows inside the outline (M1): scale 0.35→1.0 (charge), alpha ramps with progress. ──
	var s := lerpf(0.35, 1.0, progress)
	_tg_fill.polygon = geo
	_tg_fill.scale = Vector2(s, s)
	_tg_fill.color = Color(color.r, color.g, color.b, lerpf(0.10, 0.50, progress))

	# ── Edge pulse near applyTick (M1): brief outward expand in the last ~5 ticks (≈150ms @30Hz). ──
	var remain_ticks := float(tg.get("applyTick", 0)) - render_tick
	var pulse := 0.0
	if remain_ticks > 0.0 and remain_ticks < 5.0:
		pulse = sin((1.0 - remain_ticks / 5.0) * PI)  # 0 at 5t out → 1 at applyTick
	_telegraph.scale = Vector2(1.0 + 0.06 * pulse, 1.0 + 0.06 * pulse)


func _hide_telegraph() -> void:
	_telegraph.visible = false


func _telegraph_color(code: int) -> Color:
	match code:
		0:
			return DANGER_COLOR_V   # DANGER #E5484D (art-bible §3, on-palette)
		_:
			return DANGER_COLOR_V   # default danger (on-palette)


# Maps a shielded entity's ownerId (seat) → its faction tint (M2). seat % 4 → palette.
# Falls back to GOLD when ownerId is absent (defensive; shields only land on players).
func _faction_tint(ownerId: Variant) -> Color:
	if typeof(ownerId) == TYPE_INT or typeof(ownerId) == TYPE_FLOAT:
		var idx := int(ownerId) % 4
		if idx < 0:
			idx += 4
		return FACTION_TINTS[idx]
	return SHIELD_FALLBACK_TINT


# Maps TelegraphState.shape -> geometry authored along +x (origin = attacker position).
# Orientation for CONE/LINE is applied by rotating the parent _telegraph node (N2), so this
# geometry stays +x-anchored; RING/AOE_FILL are radially symmetric and ignore rotation.
func _telegraph_geometry(shape: int, radius: float) -> PackedVector2Array:
	match shape:
		TelegraphShape.RING, TelegraphShape.AOE_FILL:
			return _circle_points(radius, 28)
		TelegraphShape.CONE:
			# triangle apex at origin, widening outward along +x
			return PackedVector2Array([
				Vector2(0, 0),
				Vector2(radius, -radius * 0.6),
				Vector2(radius, radius * 0.6),
			])
		TelegraphShape.LINE:
			var h := radius * 0.4
			return PackedVector2Array([
				Vector2(0, -h),
				Vector2(radius, -h),
				Vector2(radius, h),
				Vector2(0, h),
			])
		_:
			return _circle_points(radius, 28)


func _circle_points(radius: float, segments: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	pts.resize(segments)
	for i in segments:
		var a := TAU * float(i) / float(segments)
		pts[i] = Vector2(cos(a) * radius, sin(a) * radius)
	return pts
