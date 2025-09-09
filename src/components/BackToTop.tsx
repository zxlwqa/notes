import React, { useEffect, useState, useCallback } from 'react'

interface BackToTopProps {
  threshold?: number
}

const BackToTop: React.FC<BackToTopProps> = ({ threshold = 200 }) => {
  const [visible, setVisible] = useState(false)

  const handleScroll = useCallback(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
    setVisible(scrollTop > threshold)
  }, [threshold])

  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      window.scrollTo(0, 0)
    }
  }

  useEffect(() => {
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  if (!visible) return null

  return (
    <button
      onClick={scrollToTop}
      aria-label="返回顶部"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: 9999,
        background: 'rgba(59, 130, 246, 0.95)',
        color: '#ffffff',
        border: 'none',
        borderRadius: '9999px',
        width: '56px',
        height: '56px',
        cursor: 'pointer',
        boxShadow: '0 10px 25px rgba(59, 130, 246, 0.4)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        fontSize: '20px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(59, 130, 246, 0.5)'
        e.currentTarget.style.background = 'rgba(37, 99, 235, 0.98)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.4)'
        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.95)'
      }}
    >
      ↑
    </button>
  )
}

export default BackToTop
