"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AudioSource } from "./createAudio";

interface ZoomProps {
  audioSource: AudioSource;
}

export default function Zoom({ audioSource }: ZoomProps) {
  const { data, update } = audioSource;

  useFrame((state) => {
    update();
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.fov = 25 - data.avg / 15;
    cam.updateProjectionMatrix();
  });

  return null;
}
