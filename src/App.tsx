import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { toast as sonnerToast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { InstallPromptDialog } from "./components/InstallPromptDialog";
import { useOnboarding } from "./contexts/OnboardingContext";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TimeTracking from "./pages/TimeTracking";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectOverview from "./pages/ProjectOverview";
import MyHours from "./pages/MyHours";
import MyDocuments from "./pages/MyDocuments";
import Reports from "./pages/Reports";
import ConstructionSites from "./pages/ConstructionSites";
import Admin from "./pages/Admin";
import HoursReport from "./pages/HoursReport";
import Employees from "./pages/Employees";
import Notepad from "./pages/Notepad";
import MaterialList from "./pages/MaterialList";
import Disturbances from "./pages/Disturbances";
import DisturbanceDetail from "./pages/DisturbanceDetail";
import DeliveryNotes from "./pages/DeliveryNotes";
import DeliveryNoteDetail from "./pages/DeliveryNoteDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const {
    showInstallDialog,
    handleInstallDialogClose,
  } = useOnboarding();
  const navigate = useNavigate();

  // Global auth state listener - redirect to /auth on sign out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Ensure user profile exists (for users created via Cloud dashboard)
  // Auto-assign admin role for rasenfredl@gmail.com
  useEffect(() => {
    const ensureProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('ensure_user_profile');

        // Auto admin role for rasenfredl@gmail.com
        if (user.email === "rasenfredl@gmail.com") {
          const { data: existingRole } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .single();

          if (!existingRole) {
            await supabase.from("user_roles").insert({
              user_id: user.id,
              role: "administrator",
            });
          } else if (existingRole.role !== "administrator") {
            await supabase
              .from("user_roles")
              .update({ role: "administrator" })
              .eq("user_id", user.id);
          }
        }
      }
    };
    ensureProfile();
  }, []);

  // Global real-time notification listener
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const notif = payload.new as { type: string; message: string };
            if (notif.type === 'krankmeldung') {
              sonnerToast('🏥 Neue Krankmeldung', {
                description: notif.message,
                duration: 8000,
              });
            } else if (notif.type === 'lohnzettel') {
              sonnerToast('📄 Neuer Lohnzettel', {
                description: notif.message,
                duration: 8000,
              });
            }
          }
        )
        .subscribe();
    };

    setupNotifications();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/time-tracking" element={<TimeTracking />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectOverview />} />
        <Route path="/projects/:projectId/:type" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/materials" element={<MaterialList />} />
        <Route path="/my-hours" element={<MyHours />} />
        <Route path="/my-documents" element={<MyDocuments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/construction-sites" element={<ConstructionSites />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/hours-report" element={<HoursReport />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/notepad" element={<Notepad />} />
        <Route path="/disturbances" element={<Disturbances />} />
        <Route path="/disturbances/:id" element={<DisturbanceDetail />} />
        <Route path="/delivery-notes" element={<DeliveryNotes />} />
        <Route path="/delivery-notes/:id" element={<DeliveryNoteDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Install Prompt Dialog */}
      <InstallPromptDialog
        open={showInstallDialog}
        onClose={handleInstallDialogClose}
      />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OnboardingProvider>
          <AppContent />
        </OnboardingProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
