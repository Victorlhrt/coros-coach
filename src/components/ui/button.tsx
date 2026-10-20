import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Button as ArcButton, type ButtonVariant } from '@/components/arc/button/button'

/** Bouton Arc, avec les noms de variantes historiques de l'app. */
const VARIANTS: Record<string, ButtonVariant> = {
  default: 'primary',
  secondary: 'secondary',
  outline: 'secondary',
  ghost: 'ghost',
  destructive: 'danger',
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart'> & {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'default', size = 'default', style, ...props }, ref) {
  return (
    <ArcButton
      ref={ref}
      variant={VARIANTS[variant]}
      size={size === 'default' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
      style={size === 'icon' ? { width: 'var(--control-height-md)', paddingInline: 0, ...style } : style}
      {...props}
    />
  )
})
