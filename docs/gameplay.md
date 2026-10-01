# Gameplay

Principle: **less unnecessary complexity, more sensation**. The driving model is arcade, predictable and permissive.

## Vehicle model (`shared/src/physics/ArcadeVehicle.ts`)

2.5D model at a fixed 60 Hz step (up to 10 catch-up steps per frame so slow devices stay real-time):

- **Longitudinal**: throttle with speed-dependent accel curve, brake, reverse, coast drag, off-road drag and speed cap.
- **Steering**: yaw rate grows with speed up to `turnSpeedRef`, then falls off at top speed; input smoothing (faster when reversing direction).
- **Grip**: lateral velocity damped by `grip`; part of the lost lateral energy is returned forward (keeps momentum in corners).
- **Drift**: brake + steer above 17 m/s. Low grip, extra yaw, outward slide, counter-steer widens the arc; charges boost, **mini-turbo** on exit (> 0.7 s).
- **Air**: ballistic takeoff detection from road profile (crests, kicker ramps), air control, landing impact (camera, dust, suspension, haptics); airtime charges boost.
- **Collisions**: barriers resolved analytically in the track frame (impulse + tangential loss proportional to the impact angle → scrapes keep speed, head-on hurts) + heading recovery; car-to-car circle impulses with mass ratio (Monster Truck shoves, Motorcycle gets spun).
- **Recovery**: auto-respawn when stuck 3 s or fallen; manual `R` / "REPLACER" to the last validated checkpoint; wrong-way warning.

## The four vehicles (felt, not just displayed)

| | Sport Car | Motorcycle | Buggy | Monster Truck |
|---|---|---|---|---|
| Top speed | 64 m/s | 61 | 58 | 54 |
| Accel | high | highest | medium | low |
| Handling | precise | twitchiest steering, fastest response | soft slides | slow response |
| Mass / impacts | 1.0 | 0.55, spins easily | 0.95 | 2.3, pushes everyone |
| Off-road | slowed a lot | slowed | barely slowed, more dust | little |
| Suspension | stiff | stiff + lean into turns | long travel | very long, visible |
| Engine sound | high | buzzy | mid | deep |

Upgrades (engine / handling / boost, 5 levels each) modify the tuning; prices live only on the server.

## Camera (`DynamicRaceCamera`)

Follow with interpolation, speed-based FOV (+ boost FOV and punch), distance grows with speed/boost, blend toward velocity direction in drifts (shows the slide), slight roll into turns, airtime float, trauma-based shake on impacts/landings, ground clamp, intro orbit during countdown, slow orbit at the finish.

## Speed sensation

FOV, close lampposts/buildings/chevrons, road dashes, particles, engine pitch with gear shifts, wind noise ∝ v², boost vignette + speed lines overlay, subtle high-speed camera buzz.

## Race loop

Grid (cars held, throttle revs engine) → lights 3-2-1-GO (start gantry + HUD + beeps) → 3 laps with ordered checkpoints → ARRIVÉE → finish camera, cool-down autopilot → results → rewards (online) → rematch / garage.

## Bots

`AutoPilot` (pure pursuit + curvature-based target speed + boost on straights) on top of the **same** vehicle simulation. Tuned to be beatable on touch controls: skill 0.72–0.82 plus rubber band (ease off when ahead of the best human, push slightly when far behind). Server bots in online races, local bots offline.

## Tracks

`TrackDefinition` = closed control points (+ elevation, width), ramps, checkpoints, palette, decor seed. City (1651 m, elevation + 2 kickers, 8 checkpoints) is complete; Desert (1379 m, dunes, canyon walls, rocks, cacti, tumbleweeds) is a playable preview. Adding a track = adding a definition.
