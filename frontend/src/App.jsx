import React, { useState, useEffect } from 'react';
import { useAppLogic } from './useAppLogic';
import DesktopApp from './DesktopApp';
import MobileApp from './MobileApp';
import './index.css';

export default function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const logic = useAppLogic();

  return isMobile ? <MobileApp {...logic} /> : <DesktopApp {...logic} />;
}
