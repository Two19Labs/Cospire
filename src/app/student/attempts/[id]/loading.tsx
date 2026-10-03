import { Skeleton, SkeletonLines } from "@/features/auth/components/shell-skeleton";
import styles from "@/features/test-engine/components/exam.module.css";

// The exam's own frame while a sitting loads: the ink bar, the question pane and
// the palette column, with no application shell -- the shape the student is
// about to see, so the first paint does not flash a sidebar that then vanishes.
// Moving between questions never comes here; that happens in the browser.
export default function Loading() {
  return (
    <div aria-busy="true" className={styles.exam}>
      <header className={styles.top}>
        <span aria-hidden="true" className={styles.brand}>
          C
        </span>
        <span aria-hidden="true" className={styles.divider} />
        <span className={styles.title}>Opening the test…</span>
      </header>
      <div aria-hidden="true" className={styles.sitting}>
        <div className={styles.main}>
          <div className={styles.sectionBar}>
            <Skeleton width="40%" />
          </div>
          <div className={styles.qhead}>
            <Skeleton className="skeleton--title" width="30%" />
          </div>
          <div className={styles.question}>
            <SkeletonLines count={3} />
            <div className={styles.options}>
              {[0, 1, 2, 3].map((index) => (
                <div className={`${styles.option} ${styles.ghost}`} key={index}>
                  <Skeleton width={`${50 + index * 10}%`} />
                </div>
              ))}
            </div>
          </div>
          <div className={styles.actions} />
        </div>
        <aside className={styles.side}>
          <div className={styles.who}>
            <Skeleton width="60%" />
          </div>
          <div className={styles.paletteScroll}>
            <div className={styles.palette}>
              {Array.from({ length: 10 }, (_, index) => (
                <span className={`${styles.cell} ${styles.ghost}`} key={index} />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
