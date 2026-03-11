import { motion } from "framer-motion";

export default function Ambient() {
  return (
    <>
      <div className="bg-noise" />
      <motion.div
        className="orb"
        style={{ width: 240, height: 240, top: 60, left: -40, background: "#6ea8fe" }}
        animate={{ x: [0, 40, -10, 0], y: [0, -10, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="orb"
        style={{ width: 300, height: 300, bottom: -40, right: -20, background: "#8a7afe" }}
        animate={{ x: [0, -30, 10, 0], y: [0, 20, -15, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}
