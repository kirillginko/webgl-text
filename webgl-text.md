Recreating Responsive and SEO-Friendly WebGL Text in Next.js with Three.js and Drei

This guide outlines the steps to recreate the Codrops WebGL Text Project using Next.js, Three.js, and Drei.

🛠 Tech Stack

Next.js

Three.js

@react-three/fiber (react-three-fiber)

@react-three/drei (helpers for Three.js)

Troika-three-text (underlying library used by Drei's <Text3D>)

Custom WebGL shaders (optional for advanced features)

📁 Folder Structure

my-webgl-text-project/
├── components/
│ └── WebGLText.js
├── pages/
│ └── index.js
├── public/
│ └── fonts/your-font.typeface.json
├── styles/
│ └── globals.css
├── package.json
└── README.md

✅ Setup Instructions

Initialize Project

npx create-next-app@latest my-webgl-text-project
cd my-webgl-text-project

Install Dependencies

pnpm add three @react-three/fiber @react-three/drei

Add Font File
Download a .typeface.json version of your desired font (e.g., via facetype.js generator) and place it in public/fonts/.

Create WebGLText Component

// components/WebGLText.js
import { Canvas } from '@react-three/fiber';
import { Center, Text3D, OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';

export default function WebGLText() {
return (
<Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
<ambientLight intensity={1} />
<Suspense fallback={null}>
<Center>
<Text3D
            font="/fonts/your-font.typeface.json"
            size={1.2}
            height={0.2}
            bevelEnabled
            bevelThickness={0.02}
            bevelSize={0.02}
            bevelSegments={5}
          >
Hello WebGL
<meshStandardMaterial color="#00ffff" />
</Text3D>
</Center>
</Suspense>
<OrbitControls />
</Canvas>
);
}

Create the Homepage

// pages/index.js
import Head from 'next/head';
import WebGLText from '../components/WebGLText';

export default function Home() {
return (
<>
<Head>
<title>Responsive WebGL Text</title>
<meta name="description" content="SEO-friendly WebGL text example using Three.js and Next.js" />
</Head>
<main style={{ height: '100vh', margin: 0 }}>
<WebGLText />
</main>
</>
);
}

(Optional) Add Styles

/_ styles/globals.css _/
html, body {
margin: 0;
padding: 0;
height: 100%;
font-family: sans-serif;
}

Run the App

pnpm dev

🔍 SEO Tips

Use standard <h1> tags outside the <Canvas> for crawlers.

Use transparent 3D text as visual replacement for the real HTML text.

Use <meta> and <title> for every page.

🧠 Advanced Enhancements

Replace <Text3D> with custom shader materials for animation.

Animate text appearance with useSpring from @react-spring/three.

Load and position 3D text responsively based on screen size.

🤖 Instructions for an AI Assistant

Set up a Next.js app with @react-three/fiber and @react-three/drei.

Load a custom font using Drei’s <Text3D> component.

Create a component that renders 3D text inside a <Canvas>.

Ensure SEO by setting proper <title> and <meta> tags.

Place the actual text in an <h1> outside of WebGL and hide it visually for accessibility.

Use suspense and lazy loading where needed.

Optimize for responsiveness.

🔗 References

Original Codrops Tutorial: https://tympanus.net/codrops/2025/06/05/how-to-create-responsive-and-seo-friendly-webgl-text/

Drei Docs: https://github.com/pmndrs/drei

Fiber Docs: https://docs.pmnd.rs/react-three-fiber/getting-started/introduction

Facetype Font Converter: https://gero3.github.io/facetype.js/

Happy hacking 🧪
