/**
 * ResizeHandle — a thin draggable divider between panels.
 *
 * Renders a 4px wide strip that highlights on hover and turns blue while dragging.
 * Reports horizontal drag delta via onResize callback.
 */

import { useRef, useCallback, useState } from "react";

interface ResizeHandleProps {
  /** Called with the horizontal pixel delta while dragging */
  onResize: (deltaX: number) => void;
}

export default function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      startXRef.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current;
        startXRef.current = ev.clientX;
        onResize(delta);
      };

      const onMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onResize]
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-1 shrink-0 cursor-col-resize rounded-full transition-colors duration-150 ${
        dragging
          ? "bg-blue-500"
          : "bg-zinc-700 hover:bg-zinc-500"
      }`}
      title="Drag to resize"
    />
  );
}
