import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { VoiceReportingPage } from '@/pages/VoiceReportingPage'
import { IncidentAnalysisPage } from '@/pages/IncidentAnalysisPage'
import { WorkOrdersPage } from '@/pages/WorkOrdersPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="voice" element={<VoiceReportingPage />} />
          <Route path="analysis" element={<IncidentAnalysisPage />} />
          <Route path="analysis/:incidentId" element={<IncidentAnalysisPage />} />
          <Route path="work-orders" element={<WorkOrdersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
