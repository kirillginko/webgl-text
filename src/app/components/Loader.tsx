"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import styles from "./Loader.module.css";

interface LoaderProps {
  onComplete?: () => void;
}

// Create a static initial grid for consistent server/client rendering
const createInitialGrid = (size: number): string[] => {
  return Array(size * size).fill("");
};

export default function Loader({ onComplete }: LoaderProps) {
  const targetPattern = ["OBLAST", "STUDIOS"];
  const gridSize = 6;
  const totalCells = gridSize * gridSize;
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animationsRef = useRef<gsap.core.Timeline[]>([]);

  // Initialize with empty grid for consistent SSR
  const [grid, setGrid] = useState(() => createInitialGrid(gridSize));
  const [isAnimating, setIsAnimating] = useState(false);
  const [revealedCells, setRevealedCells] = useState<Set<number>>(new Set());
  const [isClient, setIsClient] = useState(false);

  // Generate random letters (client-side only)
  const getRandomLetter = () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26));

  // Generate colors for each position
  const getLetterColor = (index: number): string => {
    const colors = [
      "#ff6b6b",
      "#4ecdc4",
      "#45b7d1",
      "#96ceb4",
      "#ffeaa7",
      "#dda0dd",
      "#98d8c8",
      "#f06292",
      "#aed581",
      "#ffb74d",
      "#64b5f6",
      "#f48fb1",
      "#81c784",
      "#ffcc02",
      "#e57373",
      "#4db6ac",
      "#9575cd",
      "#ff8a65",
      "#a1c4fd",
      "#c2e9fb",
      "#fbc2eb",
      "#a6c1ee",
      "#ffecd2",
      "#fcb69f",
      "#d299c2",
      "#fef9d3",
      "#dee2fc",
      "#b5fffc",
      "#ffd3e1",
      "#c1fba4",
      "#ffdfba",
      "#e0c3fc",
      "#f093fb",
      "#f5f7fa",
      "#c3cfe2",
      "#667eea",
    ];
    return colors[index % colors.length];
  };

  // Initialize client-side state
  useEffect(() => {
    setIsClient(true);
    setIsAnimating(true);
    setGrid(Array.from({ length: totalCells }, () => getRandomLetter()));
  }, [totalCells]);

  // GSAP random flashing animation
  useEffect(() => {
    if (!isClient || !isAnimating) return;

    // Clear any existing animations
    animationsRef.current.forEach((tl) => tl.kill());
    animationsRef.current = [];

    const animations = cellRefs.current
      .map((cell, index) => {
        if (!cell || revealedCells.has(index)) return null;

        const tl = gsap.timeline({ repeat: -1 });
        tl.to(cell.firstChild, {
          opacity: 0,
          duration: 0.05,
          ease: "none",
          delay: Math.random() * 0.1,
          onComplete: () => {
            if (!revealedCells.has(index)) {
              setGrid((prev) => {
                const newGrid = [...prev];
                newGrid[index] = getRandomLetter();
                return newGrid;
              });
            }
          },
        }).to(cell.firstChild, {
          opacity: 1,
          duration: 0.05,
          ease: "none",
        });

        animationsRef.current.push(tl);
        return tl;
      })
      .filter(Boolean);

    return () => {
      animations.forEach((anim) => anim?.kill());
    };
  }, [isAnimating, revealedCells, isClient]);

  // Reveal sequence
  useEffect(() => {
    if (!isClient) return;

    const timer = setTimeout(() => {
      const revealPattern = () => {
        let currentRow = 0;
        let currentCol = 0;

        const revealNext = () => {
          if (currentRow >= gridSize) {
            setIsAnimating(false);
            onComplete?.();
            return;
          }

          const index = currentRow * gridSize + currentCol;
          const cell = cellRefs.current[index];

          if (cell) {
            // Kill any existing animation for this cell
            animationsRef.current[index]?.kill();

            // Get the pattern row based on current row modulo 2
            const patternRow = targetPattern[currentRow % 2];
            // Get the character from the pattern, or space if beyond pattern length
            const char =
              currentCol < patternRow.length ? patternRow[currentCol] : " ";

            // Update the grid and mark cell as revealed
            setGrid((prev) => {
              const newGrid = [...prev];
              newGrid[index] = char;
              return newGrid;
            });

            setRevealedCells((prev) => {
              const newSet = new Set(prev);
              newSet.add(index);
              return newSet;
            });

            gsap.fromTo(
              cell.firstChild,
              { opacity: 0 },
              {
                opacity: 1,
                duration: 0.1,
                ease: "power2.inOut",
                onComplete: () => {
                  currentCol++;
                  if (currentCol >= gridSize) {
                    currentCol = 0;
                    currentRow++;
                  }
                  setTimeout(revealNext, 50);
                },
              }
            );
          }
        };

        revealNext();
      };

      revealPattern();
    }, 1000);

    return () => clearTimeout(timer);
  }, [onComplete, totalCells, isClient, gridSize]);

  return (
    <div className={styles.loaderContainer}>
      <div className={styles.grid}>
        {grid.map((letter, index) => (
          <div
            key={index}
            ref={(el: HTMLDivElement | null): void => {
              cellRefs.current[index] = el;
            }}
            className={`${styles.cell} ${
              revealedCells.has(index) ? styles.revealed : ""
            }`}
            style={{ color: getLetterColor(index) }}
            data-letter={letter}
          >
            <span>{letter}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
