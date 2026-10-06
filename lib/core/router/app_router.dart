import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
import '../../features/team/team_screen.dart';

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
import '../../features/quotes/quote_approval_screen.dart';
import '../../features/invoices/invoice_payment_screen.dart';
import '../../features/portal/customer_home_screen.dart';

import '../../features/field/technician_tracking_screen.dart';
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
import '../../features/more/more_screen.dart';

// Build observers list, only adding SentryNavigatorObserver when Sentry is enabled
List<NavigatorObserver> _buildObservers() {
  final observers = <NavigatorObserver>[];
  if (AppConfig.isSentryEnabled) {
    observers.add(SentryNavigatorObserver());
  }
  return observers;
}

/// The app router, driven by the auth state.
///
/// Every navigation decision that depends on "who is the user" lives in
/// [resolveRedirect] (route_guard.dart); widgets never navigate after an
/// auth change themselves. The redirect is re-evaluated whenever the auth
/// state or the splash gate changes, via [GoRouter.refreshListenable].
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  void notifyRouter() => refresh.value++;

  ref.listen(authNotifierProvider, (previous, next) => notifyRouter());
  ref.listen(splashGateProvider, (previous, next) => notifyRouter());

  final router = GoRouter(
    navigatorKey: GlobalKey<NavigatorState>(),
    observers: _buildObservers(),
    initialLocation: kSplashPath,
    refreshListenable: refresh,
    redirect: (context, state) {
      final authState = ref.read(authNotifierProvider);
      return resolveRedirect(
        gate: authGateFor(authState),
        role: authState.value?.role,
        path: state.uri.path,
        holdSplash: !ref.read(splashGateProvider),
      );
    },
    routes: _buildRoutes(),
  );

  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

List<RouteBase> _buildRoutes() => [
  // Auth Routes
  GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
  GoRoute(
    path: '/welcome',
    builder: (context, state) => const WelcomeScreen(),
  ),
  GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
  GoRoute(
    path: '/sign-up',
    builder: (context, state) => const SignUpScreen(),
  ),
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
      final quoteId = state.pathParameters['quoteId'] ?? '';
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
  GoRoute(
    path: '/portal/:token',
    builder: (context, state) {
      final token = state.pathParameters['token'] ?? '';
      return CustomerHomeScreen(token: token);
    },
  ),
  GoRoute(
    path: '/quote-approval/:shareToken',
    builder: (context, state) {
      final shareToken = state.pathParameters['shareToken'] ?? '';
      return QuoteApprovalScreen(shareToken: shareToken);
    },
  ),
  GoRoute(
    path: '/invoice-payment/:token/:invoiceId',
    builder: (context, state) {
      final token = state.pathParameters['token'] ?? '';
      final invoiceId = state.pathParameters['invoiceId'] ?? '';
      return InvoicePaymentScreen(token: token, invoiceId: invoiceId);
    },
  ),

  // Field & AI & Settings
  GoRoute(
    path: '/technician-tracking/:token/:jobId',
    builder: (context, state) {
      final token = state.pathParameters['token'] ?? '';
      final jobId = state.pathParameters['jobId'] ?? '';
      return TechnicianTrackingScreen(token: token, jobId: jobId);
    },
  ),
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
    path: '/profile-settings',
    builder: (context, state) => const ProfileSettingsScreen(),
  ),
  GoRoute(
    path: '/company-settings',
    builder: (context, state) => const CompanySettingsScreen(),
  ),
  GoRoute(path: '/team', builder: (context, state) => const TeamScreen()),

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
