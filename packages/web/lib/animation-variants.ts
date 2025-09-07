// Animation variants using CSS variables from design tokens

export const animationVariants = {
  // Fade variants
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: {
      duration: 0.3, // var(--duration-normal)
      ease: [0, 0, 0.2, 1], // var(--ease-out)
    },
  },

  fadeInUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  fadeInDown: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  // Scale variants
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: {
      duration: 0.2, // var(--duration-fast)
      ease: [0.34, 1.56, 0.64, 1], // var(--ease-spring)
    },
  },

  scaleInCenter: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    transition: {
      duration: 0.3,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },

  // Slide variants
  slideInRight: {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  slideInLeft: {
    initial: { x: '-100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  slideInBottom: {
    initial: { y: '100%', opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  // Container variants for staggered children
  container: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        delayChildren: 0.1,
        staggerChildren: 0.05,
      },
    },
  },

  item: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
    },
  },

  // Modal/Dialog variants
  modalOverlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: {
      duration: 0.2,
      ease: [0, 0, 0.2, 1],
    },
  },

  modalContent: {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
    transition: {
      duration: 0.3,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },

  // Drawer variants
  drawerLeft: {
    initial: { x: '-100%' },
    animate: { x: 0 },
    exit: { x: '-100%' },
    transition: {
      type: 'spring',
      damping: 30,
      stiffness: 300,
    },
  },

  drawerRight: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: {
      type: 'spring',
      damping: 30,
      stiffness: 300,
    },
  },

  // Tooltip variants
  tooltip: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: {
      duration: 0.1, // var(--duration-instant)
      ease: [0, 0, 0.2, 1],
    },
  },

  // Loading variants
  pulse: {
    animate: {
      opacity: [1, 0.5, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },

  spin: {
    animate: {
      rotate: 360,
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: 'linear',
      },
    },
  },

  // Bounce
  bounce: {
    animate: {
      y: [0, -20, 0],
      transition: {
        duration: 0.6,
        repeat: Infinity,
        repeatType: 'reverse',
        ease: 'easeOut',
      },
    },
  },
};

// Gesture variants for interactive elements
export const gestureVariants = {
  tap: {
    scale: 0.98,
    transition: {
      duration: 0.1,
      ease: [0.4, 0, 0.2, 1],
    },
  },

  hover: {
    scale: 1.02,
    transition: {
      duration: 0.2,
      ease: [0, 0, 0.2, 1],
    },
  },

  hoverLift: {
    y: -2,
    transition: {
      duration: 0.2,
      ease: [0, 0, 0.2, 1],
    },
  },
};

// Page transition variants
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  in: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0, 0, 0.2, 1],
    },
  },
  out: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 1, 1],
    },
  },
};

// Create motion preferences helper
export const motionPreferences = {
  // Check if user prefers reduced motion
  shouldReduceMotion: () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // Get appropriate variant based on motion preference
  getVariant: (variant: any, reducedVariant?: any) => {
    if (motionPreferences.shouldReduceMotion()) {
      return reducedVariant || { initial: {}, animate: {}, exit: {} };
    }
    return variant;
  },

  // Get appropriate transition based on motion preference
  getTransition: (transition: any, reducedTransition?: any) => {
    if (motionPreferences.shouldReduceMotion()) {
      return reducedTransition || { duration: 0 };
    }
    return transition;
  },
};