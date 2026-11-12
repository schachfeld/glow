import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Armchair,
  BedDouble,
  CookingPot,
  Monitor,
  Bath,
  Utensils,
  Flower2,
  Sun,
  Thermometer,
  X,
} from "lucide-react";
import { whiteToHex } from "../packages/core/color.mjs";
import { useSliderDraft } from "./slider";
import { useSmoothing } from "./smoothing";
import { onDialogBack, popDialogEntry, pushDialogEntry } from "./dialogs";

export const roomIcons: Record<string, typeof Armchair> = {
  living: Armchair,
  bedroom: BedDouble,
  kitchen: CookingPot,
  office: Monitor,
  bathroom: Bath,
  dining: Utensils,
  garden: Flower2,
};
export function RoomIcon({
  style,
  size = 22,
}: {
  style: string;
  size?: number;
}) {
  const Icon = roomIcons[style] ?? Armchair;
  return <Icon size={size} strokeWidth={1.6} />;
}
export function Toggle({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${on ? "is-on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

const unsmoothed = { enabled: false, amount: 0 };

// Releasing a slider by pointer, key or focus reports its final value.
function useSlider(
  value: number,
  onChange: (value: number) => void | Promise<boolean | void>,
  smooth: boolean,
  step = 1,
) {
  const smoothing = useSmoothing();
  const { draft, change, commit } = useSliderDraft(
    value,
    onChange,
    smooth ? smoothing : unsmoothed,
    step,
  );
  const events = {
    onPointerUp: commit,
    onKeyUp: commit,
    onBlur: commit,
    onPointerCancel: commit,
  };
  return { draft, change, events };
}

export function Brightness({
  value,
  onChange,
  disabled = false,
  label = "Brightness",
  compact = false,
  smooth = true,
}: {
  value: number;
  onChange: (value: number) => void | Promise<boolean | void>;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  // Ease the light toward the thumb, as set in Settings. A scene editor
  // turns this off, since its slider value is also what gets saved.
  smooth?: boolean;
}) {
  const { draft, change, events } = useSlider(value, onChange, smooth);
  return (
    <div
      className={`brightness ${compact ? "compact" : ""} ${disabled ? "disabled" : ""}`}
    >
      <Sun size={compact ? 16 : 19} strokeWidth={1.6} />
      <input
        type="range"
        min={value === 0 ? 0 : 1}
        max="100"
        value={draft}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${draft}%`}
        style={{ "--fill": `${draft}%` } as CSSProperties}
        onChange={(e) => change(Number(e.target.value))}
        {...events}
      />
      <span>
        {draft}
        <small>%</small>
      </span>
    </div>
  );
}

// White light from warm to cool, on a track painted with those whites.
export function WhiteSlider({
  value,
  min,
  max,
  onChange,
  disabled = false,
  inactive = false,
  label = "White temperature",
  compact = false,
  smooth = true,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (kelvin: number) => void | Promise<boolean | void>;
  disabled?: boolean;
  // The light shows a color, so no white is selected.
  inactive?: boolean;
  label?: string;
  compact?: boolean;
  // Ease the light toward the thumb, as set in Settings. A scene editor
  // turns this off, since its slider value is also what gets saved.
  smooth?: boolean;
}) {
  const { draft, change, events } = useSlider(value, onChange, smooth, 50);
  // While the light shows a color, tapping the slider where it already is
  // still means "this white".
  const select = () => {
    if (inactive && !disabled) onChange(draft);
  };
  const stops = Array.from({ length: 5 }, (_, i) =>
    whiteToHex(min + ((max - min) * i) / 4),
  );
  return (
    <div
      className={`brightness white-slider ${compact ? "compact" : ""} ${disabled ? "disabled" : ""} ${inactive ? "inactive" : ""}`}
    >
      <Thermometer size={compact ? 16 : 19} strokeWidth={1.6} />
      <input
        type="range"
        min={min}
        max={max}
        step={50}
        value={draft}
        disabled={disabled || max <= min}
        aria-label={label}
        aria-valuetext={inactive ? "Showing a color" : `${draft} K`}
        style={
          {
            "--track": `linear-gradient(to right, ${stops.join(", ")})`,
          } as CSSProperties
        }
        onChange={(e) => change(Number(e.target.value))}
        {...events}
        onPointerUp={() => {
          select();
          events.onPointerUp();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") select();
        }}
      />
      <span>
        {draft}
        <small> K</small>
      </span>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    let open = true;
    pushDialogEntry();
    const stop = onDialogBack(() => {
      close.current();
      // A dialog may stay open, for example to confirm discarding changes.
      requestAnimationFrame(() => {
        if (open) pushDialogEntry();
      });
    });
    return () => {
      open = false;
      stop();
      popDialogEntry();
      dialog.close();
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const bounds = ref.current.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="icon-button close-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function RoomArt({ kind }: { kind: string }) {
  return (
    <svg
      className="room-art"
      viewBox="0 0 360 190"
      fill="none"
      aria-hidden="true"
    >
      <path d="M30 164H330" stroke="currentColor" strokeOpacity=".22" />
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "living" && (
          <>
            <path d="M77 148v-40a13 13 0 0 1 13-13h103a13 13 0 0 1 13 13v40M84 158v7m114-7v7" />
            <path
              d="M74 120h6a7 7 0 0 1 7 7v12h109v-12a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H74a7 7 0 0 1-7-7v-24a7 7 0 0 1 7-7Z"
              fill="currentColor"
              fillOpacity=".09"
            />
            <path
              d="M143 100v32M247 164V77m-14 87h28M233 47h27l13 30h-53l13-30Z"
              fill="currentColor"
              fillOpacity=".08"
            />
            <path d="M288 163v-33m-11 0h23l-4 33h-15l-4-33Z" />
            <path d="M288 130c-21-10-18-28-18-28s19 2 18 28Zm0-4c17-6 21-22 21-22s-19-1-21 22Z" />
          </>
        )}
        {kind === "bedroom" && (
          <>
            <path
              d="M97 124V85a8 8 0 0 1 8-8h146a8 8 0 0 1 8 8v39M92 157v8m173-8v8M90 126h178v31H90v-31Z"
              fill="currentColor"
              fillOpacity=".07"
            />
            <path d="m97 112-7 14m169-14 9 14M101 123v-16h65v16m20 0v-16h65v16M90 138h178M65 127v37m-16-37h32M65 127V95m-12-21h24l8 21H45l8-21Z" />
            <path d="M139 38h75v24h-75z" strokeOpacity=".45" />
          </>
        )}
        {kind === "kitchen" && (
          <>
            <path
              d="M69 103h228v10H69zM75 113v51h216v-51M143 114v48m80-48v48M153 125h59v30h-59zM173 119h19M88 125h12m141 0h12M97 100V87m0 0c0-17 21-17 21-3"
              fill="currentColor"
              fillOpacity=".05"
            />
            <path
              d="M112 21v35m-15 0h30l12 20H85l12-20Zm138-35v35m-15 0h30l12 20h-54l12-20Z"
              fill="currentColor"
              fillOpacity=".08"
            />
          </>
        )}
        {kind === "dining" && (
          <>
            <path
              d="M101 112h159v9H101zm14 10-6 42m137-42 6 42M72 110v35h31m-31-9h29v28m-29-19v19m217-54v35h-30m30-9h-28v28m28-19v19M181 24v35m-23 0h46l13 25h-73l14-25Z"
              fill="currentColor"
              fillOpacity=".07"
            />
            <path d="M175 110V96h13v14m-7-14V81m0 10c-12-2-15-11-15-11s13 0 15 11m0-5c10-2 12-9 12-9s-10 0-12 9" />
          </>
        )}
        {kind === "office" && (
          <>
            <path
              d="M74 113h218v8H74zm10 8v43m198-43v43M135 56h96v52h-96zM139 99h88M184 108v5m72-3V86l-16-19m-7-9 12 11-17 6-7-7 12-10ZM155 161v-23a8 8 0 0 1 8-8h43a8 8 0 0 1 8 8v23m-40 3v-5h21v5"
              fill="currentColor"
              fillOpacity=".06"
            />
          </>
        )}
        {kind === "bathroom" && (
          <>
            <path
              d="M83 109h196v10H83zm10 10v45h176v-45m-88 0v45M115 99h134v10H115zm21-5V45a45 45 0 0 1 90 0v49M179 98V85c0-12 16-12 16-1M112 132h13m75 0h13M105 48v28m146-28v28"
              fill="currentColor"
              fillOpacity=".06"
            />
          </>
        )}
        {![
          "living",
          "bedroom",
          "kitchen",
          "dining",
          "office",
          "bathroom",
        ].includes(kind) && (
          <>
            <path d="M132 164h89l15-63H117l15 63ZM176 101V37m0 42c-37-1-51-31-51-31s42-6 51 31Zm0-18c34 0 45-33 45-33s-40 1-45 33Z" />
          </>
        )}
      </g>
    </svg>
  );
}

export function SceneOrb({
  palette,
  small = false,
}: {
  palette: string;
  small?: boolean;
}) {
  return (
    <div
      className={`scene-orb palette-${palette} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </div>
  );
}
