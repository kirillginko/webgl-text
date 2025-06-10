import WebGLTextScene from "./components/WebGLTextScene";
//import ModelViewer from "./components/ModelViewer";
import WebGLImageScene from "./components/WebGLImageScene";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main>
      <WebGLTextScene />
      <div className={styles.content}>
        <h1 className={styles.contentH1}>
          <span className={`${styles.textPlane}  text-plane`}>
            Hard.Services
          </span>
        </h1>

        <h2 className={styles.contentH2}>
          <span className={`${styles.textPlane} text-plane`}>
            Multi-Disciplinary Design Agency
          </span>
        </h2>

        <div className={styles.textBlock}>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              is a design studio centered on new ideas and defining experiences,
              partnering with our generation’s leading brands and innovators to
              influence culture. Our approach challenges industry standards,
              adopts new technologies, and has a lasting positive impact on
              ourselves and others.
            </span>
          </p>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              Over time, the work has naturally led us toward industry leaders
              across Art, Architecture, Fashion, Sustainability, Technology, and
              beyond.
            </span>
          </p>
        </div>

        <div className={styles.scrollBlock}>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque a dolor posuere nisi tempus rhoncus. Curabitur
              venenatis velit a tellus porttitor, sed efficitur ipsum volutpat.
              Nunc ante ante, convallis in commodo eget, semper ac ex. Fusce
              lobortis risus vel nisl interdum imperdiet. Nulla facilisi
            </span>
          </p>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              Try to scroll down to see what happens!
            </span>
          </p>
        </div>

        <div className={styles.lipsumBlock}>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              We believe that great design begins with great type. Our mission
              is to create a design language that are not just visually striking
              but also versatile, functional, and timeless. Whether you’re a
              designer, brand strategist, or creative, our work are crafted to
              inspire and elevate.
            </span>
          </p>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              Cras hendrerit iaculis est at vestibulum. Integer tincidunt mi id
              metus mollis, in fermentum odio sagittis. Vestibulum ante ipsum
              primis in faucibus orci luctus et ultrices posuere cubilia curae;
              Phasellus in efficitur diam.
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
