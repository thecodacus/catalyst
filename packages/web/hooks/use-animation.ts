import { useEffect, useState } from 'react';
import { motionPreferences } from '@/lib/animation-variants';

// Custom hook for respecting motion preferences
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// Custom hook for viewport-based animations
export function useInView(
  ref: React.RefObject<HTMLElement | null>,
  options?: IntersectionObserverInit
) {
  const [isInView, setIsInView] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!ref.current || hasAnimated) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated) {
        setIsInView(true);
        setHasAnimated(true);
      }
    }, {
      threshold: 0.1,
      ...options,
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, options, hasAnimated]);

  return isInView;
}

// Custom hook for staggered animations
export function useStaggeredAnimation(
  itemCount: number,
  baseDelay: number = 50,
  maxDelay: number = 500
) {
  return Array.from({ length: itemCount }, (_, i) => 
    Math.min(i * baseDelay, maxDelay)
  );
}

// Custom hook for scroll-triggered animations
export function useScrollAnimation(threshold: number = 100) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return isScrolled;
}

// Custom hook for parallax effects
export function useParallax(speed: number = 0.5) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * speed);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed]);

  return offset;
}

// Custom hook for hover animations
export function useHoverAnimation() {
  const [isHovered, setIsHovered] = useState(false);

  const hoverProps = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  };

  return { isHovered, hoverProps };
}

// Custom hook for focus animations
export function useFocusAnimation() {
  const [isFocused, setIsFocused] = useState(false);

  const focusProps = {
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  };

  return { isFocused, focusProps };
}

// Custom hook for delayed animations
export function useDelayedAnimation(delay: number = 0) {
  const [isReady, setIsReady] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;

    const timer = setTimeout(() => {
      setIsReady(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isReady;
}

// Custom hook for spring physics
export function useSpring(value: number, config = { stiffness: 100, damping: 20 }) {
  const [springValue, setSpringValue] = useState(value);
  const [velocity, setVelocity] = useState(0);

  useEffect(() => {
    let animationFrame: number;
    const animate = () => {
      const distance = value - springValue;
      const spring = distance * (config.stiffness / 1000);
      const damper = velocity * (config.damping / 100);
      
      const acceleration = spring - damper;
      const newVelocity = velocity + acceleration;
      const newValue = springValue + newVelocity;

      if (Math.abs(distance) < 0.01 && Math.abs(newVelocity) < 0.01) {
        setSpringValue(value);
        setVelocity(0);
      } else {
        setSpringValue(newValue);
        setVelocity(newVelocity);
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, springValue, velocity, config.stiffness, config.damping]);

  return springValue;
}