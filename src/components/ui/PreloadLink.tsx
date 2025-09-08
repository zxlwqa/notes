import React, { useCallback } from 'react'
import { Link, LinkProps } from 'react-router-dom'

interface PreloadLinkProps extends Omit<LinkProps, 'onMouseEnter'> {
  preloadComponent?: () => Promise<any>
  children: React.ReactNode
}

const PreloadLink: React.FC<PreloadLinkProps> = ({ 
  preloadComponent, 
  children, 
  ...props 
}) => {
  const handleMouseEnter = useCallback(() => {
    if (preloadComponent) {

      preloadComponent()
    }
  }, [preloadComponent])

  return (
    <Link {...props} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  )
}

export default PreloadLink
