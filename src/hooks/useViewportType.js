import { useEffect, useState } from 'react';

const PHONE_MAX_WIDTH = 520;
const TABLET_MAX_WIDTH = 980;

function getViewportType() {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  if (window.innerWidth <= PHONE_MAX_WIDTH) {
    return 'phone';
  }

  if (window.innerWidth <= TABLET_MAX_WIDTH) {
    return 'tablet';
  }

  return 'desktop';
}

export default function useViewportType() {
  const [viewportType, setViewportType] = useState(getViewportType);

  useEffect(() => {
    function handleResize() {
      setViewportType(getViewportType());
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    viewportType,
    isPhone: viewportType === 'phone',
    isTablet: viewportType === 'tablet',
    isDesktop: viewportType === 'desktop',
  };
}
