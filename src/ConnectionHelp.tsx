import type { CSSProperties } from "react";
import {
  Check,
  ExternalLink,
  House,
  Palette,
  Radio,
  Timer,
} from "lucide-react";
import {
  maxTransition,
  transitionStep,
  transitionText,
} from "../packages/core/transition.mjs";
import { Modal } from "./components";
import type { GlowClient } from "./platform/client";
import { themes, useTheme } from "./theme";
import { setLightTransition, useLightTransition } from "./transition";
import type { Home } from "./types";

export function ConnectionHelp({
  home,
  sceneStorage,
  onDisconnect,
  onClose,
}: {
  home: Home | null;
  sceneStorage: GlowClient["sceneStorage"];
  onDisconnect?: () => void;
  onClose: () => void;
}) {
  const demo = home?.mode === "demo";
  const [theme, setTheme] = useTheme();
  const transition = useLightTransition();
  return (
    <Modal title="Settings & help" onClose={onClose}>
      <div className={`connection-info ${home?.mode === "live" ? "live" : ""}`}>
        <Radio size={23} />
        <div>
          <strong>
            {demo
              ? "You’re exploring a demo home"
              : home?.connected
                ? "Connected to Home Assistant"
                : "Waiting for Home Assistant"}
          </strong>
          <p>
            {demo
              ? "Everything here is interactive. Your real lights are not connected."
              : "Rooms, lights, and existing scenes sync automatically."}
          </p>
        </div>
      </div>
      <fieldset className="theme-setting">
        <legend className="help-heading">Appearance</legend>
        <div className="group-display-options">
          {themes.map((option) => (
            <label
              key={option.id}
              className={theme === option.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={theme === option.id}
                onChange={() => setTheme(option.id)}
              />
              <span>
                <strong>{option.name}</strong>
                <small>{option.description}</small>
              </span>
              <span
                className={`theme-preview theme-preview-${option.id}`}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="fade-setting">
        <h3 className="help-heading" id="fade-heading">
          Fade time
        </h3>
        <div className="brightness">
          <Timer size={19} strokeWidth={1.6} />
          <input
            type="range"
            min="0"
            max={maxTransition}
            step={transitionStep}
            value={transition}
            aria-labelledby="fade-heading"
            aria-valuetext={transitionText(transition)}
            style={
              {
                "--fill": `${(transition / maxTransition) * 100}%`,
              } as CSSProperties
            }
            onChange={(e) => setLightTransition(Number(e.target.value))}
          />
          <span>{transitionText(transition)}</span>
        </div>
        <p>
          {transition > 0
            ? "Lights fade to each brightness, white or color you set, so they follow a slider smoothly."
            : "Glow sets no fade. Each light changes as fast as it does on its own."}
        </p>
      </div>
      {demo && (
        <>
          <h3 className="help-heading">Connect to Home Assistant</h3>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Install the Glow app</strong>
                <p>
                  Extract the Glow app package into your Home Assistant{" "}
                  <code>/local_apps</code> folder (called <code>/addons</code>{" "}
                  on older versions).
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Find it in the app store</strong>
                <p>
                  In Settings → Apps, open the app store, check for updates, and
                  install Glow from Local apps.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Start Glow</strong>
                <p>
                  Enable “Show in sidebar” and open Glow. Your existing rooms
                  and lights are ready to go.
                </p>
              </div>
            </li>
          </ol>
          <p className="help-note">
            On older versions, Apps is called Add-ons. No token, dashboard, or
            YAML setup is needed.
          </p>
        </>
      )}
      <div className="help-details">
        <div>
          <House size={18} />
          <p>
            <strong>Your rooms come from Home Assistant Areas.</strong> Lights
            without an Area appear in “Other lights”.
          </p>
        </div>
        <div>
          <Palette size={18} />
          <p>
            {demo ? (
              <>
                <strong>Demo scenes stay in Glow.</strong> Connect to Home
                Assistant to save scenes for your home.
              </>
            ) : (
              <>
                <strong>Scenes are saved in Home Assistant.</strong> New scenes
                are available on all devices and in automations. Save an older
                Glow scene to publish it. Favorites and Glow editor settings
                stay{" "}
                {sceneStorage === "device"
                  ? "on this device"
                  : "in this add-on"}
                .
              </>
            )}
          </p>
        </div>
      </div>
      <a
        className="help-docs"
        href="https://www.home-assistant.io/docs/organizing/"
        target="_blank"
        rel="noreferrer"
      >
        About rooms and Areas
        <ExternalLink size={14} />
      </a>
      <div className="modal-footer">
        {onDisconnect && (
          <button className="button" onClick={onDisconnect}>
            Disconnect
          </button>
        )}
        <button className="button primary" onClick={onClose}>
          Done
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
