import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../config/app_config.dart';
import 'app_scaffold.dart';
import 'route_guard.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/splash_screen.dart';
import '../../features/auth/welcome_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/sign_up_screen.dart';
import '../../features/auth/forgot_password_screen.dart';
import '../../features/auth/reset_password_screen.dart';
import '../../features/auth/accept_invitation_screen.dart';

import '../../features/onboarding/business_basics_screen.dart';
import '../../features/onboarding/service_area_screen.dart';
import '../../features/onboarding/services_screen.dart';
import '../../features/onboarding/team_setup_screen.dart';
import '../../features/onboarding/onboarding_complete_screen.dart';

import '../../features/dashboard/dashboard_screen.dart';
import '../../features/jobs/jobs_screen.dart';
import '../../features/jobs/job_detail_screen.dart';
import '../../features/calendar/calendar_screen.dart';
import '../../features/customers/customers_screen.dart';
import '../../features/customers/customer_detail_screen.dart';
import '../../features/customers/edit_customer_screen.dart';

import '../../features/customers/create_customer_screen.dart';
import '../../features/jobs/create_job_screen.dart';
import '../../features/jobs/schedule_job_screen.dart';
import '../../features/quotes/create_quote_screen.dart';
import '../../features/invoices/create_invoice_screen.dart';

import '../../features/quotes/quotes_screen.dart';
import '../../features/quotes/quote_detail_screen.dart';
import '../../features/invoices/invoices_screen.dart';
import '../../features/invoices/invoice_detail_screen.dart';
import '../../features/portal/customer_home_screen.dart';
import '../../features/portal/portal_closed_screen.dart';
import '../../features/portal/portal_landing_screen.dart';
import '../../features/portal/portal_open_screen.dart';

import '../../features/technician/technician_home_screen.dart';
import '../../features/technician/job_brief_screen.dart';
import '../../features/technician/en_route_screen.dart';
import '../../features/technician/work_in_progress_screen.dart';
import '../../features/technician/job_evidence_screen.dart';
import '../../features/technician/complete_job_screen.dart';
import '../../features/ai/ai_operations_assistant_screen.dart';
import '../../features/ai/ai_insight_detail_screen.dart';
import '../../features/settings/notifications_screen.dart';
import '../../features/settings/profile_settings_screen.dart';
import '../../features/settings/company_settings_screen.dart';
import '../../features/settings/team_management_screen.dart';
import '../../features/more/more_screen.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();

// Build observers list, only adding SentryNavigatorObserver when Sentry is enabled
List<NavigatorObserver> _buildObservers() {
  final observers = <NavigatorObserver>[];
  if (AppConfig.isSentryEnabled) {
    observers.add(SentryNavigatorObserver());
  }
  return observers;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  void notifyRouter() => refresh.value++;

  ref.listen(authNotifierProvider, (previous, next) => notifyRouter());
  ref.listen(splashGateProvider, (previous, next) => notifyRouter());

  final router = GoRouter(
    navigatorKey: _rootNavigatorKey,
    observers: _buildObservers(),
    initialLocation: AppConfig.isCustomerSurface ? '/' : kSplashPath,
    refreshListenable: refresh,
    redirect: (context, state) {
      // Customer surface: no staff auth exists here at all — the portal
      // session is the only credential. Anything outside the four portal
      // paths falls back to the neutral landing page (handoff 6.1).
      if (AppConfig.isCustomerSurface) {
        return _customerSurfaceRedirect(state.uri.path);
      }
      final authState = ref.read(authNotifierProvider);
      final session = authState.valueOrNull;
      final ownerOnboardingPath = switch (session?.company.onboardingStep) {
        2 => '/onboarding/service-area',
        3 => '/onboarding/services',
        4 => '/onboarding/team-setup',
        _ => kOwnerOnboardingPath,
      };
      final holdSplash = !ref.read(splashGateProvider);
      return resolveRedirect(
        gate: authGateFor(authState),
        role: authState.valueOrNull?.role,
        path: state.uri.path,
        holdSplash: holdSplash,
        ownerOnboardingPending:
            session?.role == 'OWNER' &&
            !(session?.company.onboardingComplete ?? true),
        ownerOnboardingPath: ownerOnboardingPath,
      );
    },
    routes: AppConfig.isCustomerSurface ? _customerRoutes : _staffRoutes,
  );

  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

final GoRouter appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  observers: _buildObservers(),
  initialLocation: AppConfig.isCustomerSurface ? '/' : '/splash',
  redirect: AppConfig.isCustomerSurface
      ? (context, state) => _customerSurfaceRedirect(state.uri.path)
      : null,
  routes: AppConfig.isCustomerSurface ? _customerRoutes : _staffRoutes,
);

/// The customer surface knows exactly four paths; everything else
/// (including staff paths like `/login`) lands on the neutral page.
String? _customerSurfaceRedirect(String path) {
  const allowed = {'/', '/open', '/p', '/p/closed'};
  return allowed.contains(path) ? null : '/';
}

/// Portal routes shared by both surfaces (handoff 6.1): on the staff
/// surface they let the installed app handle a portal deep link; on the
/// customer surface they are (with `/`) the entire route table.
///
/// `/open` receives the one-time token in the URL fragment — never in a
/// path parameter — and hands it to the portal session bootstrap.
final List<RouteBase> _portalRoutes = [
  GoRoute(
    path: '/open',
    builder: (context, state) => PortalOpenScreen(fragment: state.uri.fragment),
  ),
  GoRoute(path: '/p', builder: (context, state) => const CustomerHomeScreen()),
  GoRoute(
    path: '/p/closed',
    builder: (context, state) => const PortalClosedScreen(),
  ),
];

/// The customer build's complete route table (handoff 6.1).
final List<RouteBase> _customerRoutes = [
  GoRoute(path: '/', builder: (context, state) => const PortalLandingScreen()),
  ..._portalRoutes,
];

final List<RouteBase> _staffRoutes = [
  GoRoute(path: '/', redirect: (context, state) => '/dashboard'),
  // Auth Routes
  GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
  GoRoute(path: '/welcome', builder: (context, state) => const WelcomeScreen()),
  GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
  GoRoute(path: '/sign-up', builder: (context, state) => const SignUpScreen()),
  GoRoute(
    path: '/forgot-password',
    builder: (context, state) => const ForgotPasswordScreen(),
  ),
  GoRoute(
    path: '/reset-password',
    builder: (context, state) => const ResetPasswordScreen(),
  ),
  GoRoute(
    path: '/accept-invitation',
    builder: (context, state) => AcceptInvitationScreen(
      initialToken: state.uri.queryParameters['token'],
    ),
  ),

  // Onboarding Flow
  GoRoute(
    path: '/onboarding/business-basics',
    builder: (context, state) => const BusinessBasicsScreen(),
  ),
  GoRoute(
    path: '/onboarding/service-area',
    builder: (context, state) => const ServiceAreaScreen(),
  ),
  GoRoute(
    path: '/onboarding/services',
    builder: (context, state) => const ServicesScreen(),
  ),
  GoRoute(
    path: '/onboarding/team-setup',
    builder: (context, state) => const TeamSetupScreen(),
  ),
  GoRoute(
    path: '/onboarding/complete',
    builder: (context, state) => const OnboardingCompleteScreen(),
  ),

  // Creation Flows
  GoRoute(
    path: '/create-customer',
    builder: (context, state) => const CreateCustomerScreen(),
  ),
  GoRoute(
    path: '/create-job',
    builder: (context, state) => const CreateJobScreen(),
  ),
  GoRoute(
    path: '/schedule-job/:jobId',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return ScheduleJobScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/create-quote',
    builder: (context, state) => const CreateQuoteScreen(),
  ),
  GoRoute(
    path: '/create-invoice',
    builder: (context, state) {
      final jobId =
          state.uri.queryParameters['jobId'] ??
          (state.extra is String ? state.extra as String : null);
      return CreateInvoiceScreen(initialJobId: jobId);
    },
  ),

  // Commercial & Portals
  GoRoute(path: '/quotes', builder: (context, state) => const QuotesScreen()),
  GoRoute(
    path: '/quotes/:quoteId',
    builder: (context, state) {
      final quoteId = state.pathParameters['quoteId'] ?? 'QT-1048';
      return QuoteDetailScreen(quoteId: quoteId);
    },
  ),
  GoRoute(
    path: '/invoices',
    builder: (context, state) => const InvoicesScreen(),
  ),
  GoRoute(
    path: '/invoices/:invoiceId',
    builder: (context, state) {
      final invoiceId = state.pathParameters['invoiceId'] ?? '';
      return InvoiceDetailScreen(invoiceId: invoiceId);
    },
  ),
  // Secure customer portal (session-based; the old token routes
  // /portal/:token, /quote-approval/:shareToken,
  // /invoice-payment/:token/:invoiceId and /technician-tracking/:token/:jobId
  // were removed with the long-lived token design — handoff 6.1).
  ..._portalRoutes,

  // Field & AI & Settings
  GoRoute(
    path: '/technician-home',
    builder: (context, state) => const TechnicianHomeScreen(),
  ),
  GoRoute(
    path: '/technician/jobs/:jobId/brief',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return JobBriefScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/technician/jobs/:jobId/en-route',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return EnRouteScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/technician/jobs/:jobId/work',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return WorkInProgressScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/technician/jobs/:jobId/evidence',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return JobEvidenceScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/technician/jobs/:jobId/complete',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return CompleteJobScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/ai-assistant',
    builder: (context, state) => const AiOperationsAssistantScreen(),
  ),
  GoRoute(
    path: '/ai-insight/:insightId',
    builder: (context, state) {
      final insightId = state.pathParameters['insightId'] ?? '';
      return AiInsightDetailScreen(insightId: insightId);
    },
  ),
  GoRoute(
    path: '/notifications',
    builder: (context, state) => const NotificationsScreen(),
  ),
  GoRoute(
    path: '/team',
    builder: (context, state) => const TeamManagementScreen(),
  ),
  GoRoute(
    path: '/profile-settings',
    builder: (context, state) => const ProfileSettingsScreen(),
  ),
  GoRoute(
    path: '/company-settings',
    builder: (context, state) => const CompanySettingsScreen(),
  ),

  // Sub-routes for Jobs & Customers Details
  GoRoute(
    path: '/jobs/:jobId',
    builder: (context, state) {
      final jobId = state.pathParameters['jobId'] ?? '';
      return JobDetailScreen(jobId: jobId);
    },
  ),
  GoRoute(
    path: '/customers/:customerId',
    builder: (context, state) {
      final customerId = state.pathParameters['customerId'] ?? '';
      return CustomerDetailScreen(customerId: customerId);
    },
  ),
  GoRoute(
    path: '/customers/:customerId/edit',
    builder: (context, state) {
      final customerId = state.pathParameters['customerId'] ?? '';
      return EditCustomerScreen(customerId: customerId);
    },
  ),

  // Main App Shell with Bottom Navigation
  StatefulShellRoute.indexedStack(
    builder: (context, state, navigationShell) {
      return AppScaffold(navigationShell: navigationShell);
    },
    branches: [
      // Tab 0: Home / Dashboard
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
        ],
      ),

      // Tab 1: Jobs
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/jobs',
            builder: (context, state) => const JobsScreen(),
          ),
        ],
      ),

      // Tab 2: Schedule / Calendar
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/calendar',
            builder: (context, state) => const CalendarScreen(),
          ),
        ],
      ),

      // Tab 3: Customers
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/customers',
            builder: (context, state) => const CustomersScreen(),
          ),
        ],
      ),

      // Tab 4: More
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/more',
            builder: (context, state) => const MoreScreen(),
          ),
        ],
      ),
    ],
  ),
];
