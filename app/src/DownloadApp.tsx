import ModelDownloadModal from './components/modals/ModelDownloadModal'
import './styles/variables.css'

export default function DownloadApp(): JSX.Element {
  const handleReady = (): void => {
    window.api?.notifyModelReady?.()
  }
  return <ModelDownloadModal onClose={handleReady} />
}
