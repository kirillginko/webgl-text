import WebGLTextScene from "./components/WebGLTextScene";
import ModelViewer from "./components/ModelViewer";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main>
      <WebGLTextScene />
      <ModelViewer />
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
              This is an example of how we can render whole blocks of text to
              WebGL thanks to curtains.js and the TextTexture class.
            </span>
          </p>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              A WebGL plane is created for all elements that have a
              &quot;text-plane&quot; class and their text contents are drawn
              inside a 2D canvas, which is then used as a WebGL texture.
            </span>
          </p>
        </div>

        <div className={styles.scrollBlock}>
          <p>
            <span className={`${styles.textPlane} text-plane`}>
              We&apos;re using an additional shader pass to add a cool effect on
              scroll that makes you feel like the content is actually dragged.
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
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque a dolor posuere nisi tempus rhoncus. Curabitur
              venenatis velit a tellus porttitor, sed efficitur ipsum volutpat.
              Nunc ante ante, convallis in commodo eget, semper ac ex. Fusce
              lobortis risus vel nisl interdum imperdiet. Nulla facilisi
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
