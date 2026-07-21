import styles from "./neural-orbit.module.css";

export function NeuralOrbit({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className={styles.zone}>
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
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{caption}</small>
        </div>
      </div>
    </div>
  );
}
