import Image from "next/image";

import { Skeleton, SkeletonLines } from "@/features/auth/components/shell-skeleton";
import styles from "@/features/test-engine/components/exam.module.css";

// The instructions page while it loads: the exam's ink bar and one card in the
// middle, with no application shell, as the page itself is drawn.
export default function Loading() {
  return (
    <div aria-busy="true" className={styles.exam}>
      <header className={styles.top}>
        <Image alt="" className={styles.logo} height={57} priority src="/cospire-wordmark.png" width={158} />
        <span aria-hidden="true" className={styles.divider} />
        <span className={styles.title}>Opening the instructions…</span>
      </header>
      <main aria-hidden="true" className={styles.centre}>
        <section className={styles.card}>
          <Skeleton className="skeleton--title" width="50%" />
          <SkeletonLines count={5} />
        </section>
      </main>
    </div>
  );
}
