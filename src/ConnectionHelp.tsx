import { Check, ExternalLink, House, Palette, Radio } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { smoothingSeconds } from "../packages/core/smoothing.mjs";
import { Modal, Toggle } from "./components";
import { setSmoothing, useSmoothing } from "./smoothing";
import type { GlowClient } from "./platform/client";
import { themes, useTheme } from "./theme";
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
      <SmoothingSetting />
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

// Sliders can ease lights toward the thumb instead of jumping. The amount is
// saved when the slider is let go, and shown as the time lights take to
// catch up.
function SmoothingSetting() {
  const smoothing = useSmoothing();
  const [amount, setAmount] = useState(smoothing.amount);
  useEffect(() => setAmount(smoothing.amount), [smoothing.amount]);
  const save = () => {
    if (amount !== smoothing.amount) setSmoothing({ ...smoothing, amount });
  };
  const seconds = smoothingSeconds({ enabled: true, amount }).toFixed(2);
  return (
    <section className="smoothing-setting">
      <h3 className="help-heading">Sliders</h3>
      <div className="smoothing-card">
        <div className="smoothing-header">
          <span>
            <strong>Smooth light changes</strong>
            <small>
              Lights fade to where you move a slider instead of jumping there.
            </small>
          </span>
          <Toggle
            on={smoothing.enabled}
            label="Smooth light changes"
            onChange={() =>
              setSmoothing({ ...smoothing, enabled: !smoothing.enabled })
            }
          />
        </div>
        <div
          className={`brightness smoothing-amount ${smoothing.enabled ? "" : "disabled"}`}
        >
          <span>Quick</span>
          <input
            type="range"
            min="0"
            max="100"
            value={amount}
            disabled={!smoothing.enabled}
            aria-label="Smoothing amount"
            aria-valuetext={`Lights catch up in ${seconds} seconds`}
            style={{ "--fill": `${amount}%` } as CSSProperties}
            onChange={(e) => setAmount(Number(e.target.value))}
            onPointerUp={save}
            onKeyUp={save}
            onBlur={save}
          />
          <span>Smooth</span>
        </div>
        {smoothing.enabled && (
          <p className="smoothing-note">
            Lights catch up with the slider in about {seconds} s.
          </p>
        )}
      </div>
    </section>
  );
}
