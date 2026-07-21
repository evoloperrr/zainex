import styles from "./neural-orbit.module.css";

function CrownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={styles.crown}
    >
      <path
        d="M3 8.2 L7.4 11.6 L12 4.6 L16.6 11.6 L21 8.2 L19.3 17.6 H4.7 Z"
        fill="currentColor"
      />
      <circle cx="3" cy="8.2" r="1.5" fill="currentColor" />
      <circle cx="12" cy="4.6" r="1.5" fill="currentColor" />
      <circle cx="21" cy="8.2" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function NeuralOrbit({
  label,
  value,
  caption,
  variant = "default",
}: {
  label: string;
  value: string;
  caption: string;
  variant?: "default" | "premium";
}) {
  const zoneClassName =
    variant === "premium"
      ? `${styles.zone} ${styles.zonePremium}`
      : styles.zone;

  return (
    <div className={zoneClassName}>
      <div
        className={styles.glow}
        aria-hidden="true"
      />

      <div className={styles.frame}>
        <div
          className={styles.ring}
          aria-hidden="true"
        />

        <div className={styles.core}>
          {variant === "premium" ? (
            <CrownIcon />
          ) : null}
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{caption}</small>
        </div>
      </div>
    </div>
  );
}
