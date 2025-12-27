import { useLoader } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Group } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CakeProps = ThreeElements["group"];

export function Cake({ children, ...groupProps }: CakeProps) {
  const draco = useMemo(() => {
    const d = new DRACOLoader();
    d.setDecoderPath("/draco/");
    return d;
  }, []);

  useEffect(() => {
    return () => {
      draco.dispose();
    };
  }, [draco]);

  const gltf = useLoader(GLTFLoader, "/cake.glb", (loader) => {
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
  });

  const cakeScene = useMemo<Group | null>(
    () => gltf.scene?.clone(true) ?? null,
    [gltf.scene]
  );

  if (!cakeScene) return null;

  return (
    <group {...groupProps}>
      <primitive object={cakeScene} />
      {children}
    </group>
  );
}
