import './Header.css'

interface HeaderProps {
  title: string
  icon?: JSX.Element | null
}

export default function Header({ title, icon }: HeaderProps): JSX.Element {
  return (
    <header className="main-header">
      <div className="header-title" data-testid="header-title">
        {icon && <span data-testid="header-icon">{icon}</span>}
        <h1>{title}</h1>
      </div>
    </header>
  )
}
