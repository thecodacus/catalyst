'use client';

import { HTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from '@/hooks/use-animation';
import { useRef } from 'react';

interface AnimatedProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  animation?: 'fade-in' | 'fade-in-up' | 'fade-in-down' | 'scale-in' | 'slide-in-left' | 'slide-in-right' | 'slide-out-right';
  delay?: number;
  duration?: number;
  once?: boolean;
}

// Animated container component
export const Animated = forwardRef<HTMLDivElement, AnimatedProps>(
  ({ children, animation = 'fade-in', delay = 0, duration, once = true, className, ...props }, ref) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(elementRef as React.RefObject<HTMLElement | null>, { threshold: 0.1 });
    const prefersReducedMotion = useReducedMotion();

    const animationClass = prefersReducedMotion ? '' : `animate-${animation}`;
    const shouldAnimate = !once || isInView;

    return (
      <div
        ref={ref || elementRef}
        className={cn(
          'transition-opacity',
          shouldAnimate ? animationClass : 'opacity-0',
          className
        )}
        style={{
          animationDelay: `${delay}ms`,
          animationDuration: duration ? `${duration}ms` : undefined,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Animated.displayName = 'Animated';

// Staggered animation container
interface StaggeredProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode[];
  staggerDelay?: number;
  animation?: AnimatedProps['animation'];
}

export function Staggered({ children, staggerDelay = 50, animation = 'fade-in-up', className, ...props }: StaggeredProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {children.map((child, index) => (
        <Animated key={index} animation={animation} delay={index * staggerDelay}>
          {child}
        </Animated>
      ))}
    </div>
  );
}

// Skeleton loader with shimmer animation
interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ variant = 'text', width, height, className, ...props }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-muted relative overflow-hidden';
  
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const dimensions = {
    width: width || (variant === 'text' ? '100%' : variant === 'circular' ? '40px' : '100%'),
    height: height || (variant === 'text' ? '16px' : variant === 'circular' ? '40px' : '120px'),
  };

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], 'animate-shimmer', className)}
      style={dimensions}
      {...props}
    />
  );
}

// Loading spinner component
interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-muted border-t-primary',
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

// Pulse animation for notifications
interface PulseProps extends HTMLAttributes<HTMLDivElement> {
  color?: 'primary' | 'success' | 'warning' | 'error';
}

export function Pulse({ color = 'primary', className, ...props }: PulseProps) {
  const colors = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
  };

  return (
    <span className={cn('relative inline-flex', className)} {...props}>
      <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', colors[color])} />
      <span className={cn('relative inline-flex h-3 w-3 rounded-full', colors[color])} />
    </span>
  );
}

// Bounce loading dots
export function LoadingDots({ className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex space-x-1', className)}>
      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
    </div>
  );
}

// Progress bar with animation
interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
}

export function ProgressBar({ value, max = 100, showLabel = false, className, ...props }: ProgressBarProps) {
  const percentage = Math.min(Math.max(0, (value / max) * 100), 100);

  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      <div
        className="h-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
      />
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

// Collapsible with animation
interface CollapsibleProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  children: ReactNode;
}

export function Collapsible({ isOpen, children, className, ...props }: CollapsibleProps) {
  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-300 ease-in-out',
        isOpen ? 'animate-collapsible-down' : 'animate-collapsible-up',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}