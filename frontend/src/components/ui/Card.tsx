import type { ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <section className={`rounded-md border border-stone-300 bg-white p-4 ${className}`}>
      {children}
    </section>
  )
}
