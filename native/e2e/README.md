# Trying the app against Home Assistant

`home-assistant.ts` starts the same Home Assistant as the end-to-end tests in `tests/ha/`: mock lights in a Living room, Bedroom and Other lights, the **Evening glow** scene, and Glow's sign-in identity page served inside the container. It also adds a **Living lamps** light group, so group cards can be tried. Docker is required.

```sh
# From the repository root
node --experimental-transform-types native/e2e/home-assistant.ts
```

It prints the addresses, the account and a long-lived access token, and stops the container on Ctrl+C.

In an Android emulator, use the `10.0.2.2` address it prints. Then either:

- Choose **Sign in with Home Assistant** and log in as `glow` / `glow-e2e-password`. Home Assistant returns to the app through `glow-lighting://auth/callback`.
- Or choose **Use an access token instead** and paste the printed token.

Check results in Home Assistant itself, for example with `curl -H "Authorization: Bearer <token>" <address>/api/states`, or the scene configuration API for saved scenes.

There are no automated device tests yet. The checklist below was run by hand on an Android 16 emulator (Pixel 8) against this Home Assistant:

- Account sign-in through Home Assistant's login page, token sign-in, staying signed in across restarts, disconnecting and forgetting the sign-in.
- Rooms from Areas, room power and brightness, light power, brightness, color wheel, swatches, white slider and presets.
- Light group card, its individual lights, and **Customize lights**.
- Activating and favoriting a Home Assistant scene; creating, previewing, editing, discarding and deleting a Glow scene in Home Assistant.
- **All lights off** and undo, live updates made in Home Assistant, the reconnection banner, scene filters, both themes and the demo home.
- Routes (**Settings & help → Routes**): adding a second route to the same Home Assistant (`http://127.0.0.1:<port>/` after `adb reverse tcp:<port> tcp:<port>`), refusing an unreachable one, moving a route up, falling back when the route in use stops answering (`adb reconnect` drops the reverse tunnel), moving back within a minute when it answers again, keeping the list across restarts, and removing the route in use. On the **Welcome home** screen with the saved route out of reach: refusing a route to a different Home Assistant without forgetting the sign-in, and adding the other route and connecting over it. Learning Home Assistant's external URL (set with the `config/core/update` websocket command) and not adding it again after it is removed.
