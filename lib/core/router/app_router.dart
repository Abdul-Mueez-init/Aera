import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_scaffold.dart';
import '../../features/auth/splash_screen.dart';
import '../../features/auth/welcome_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/sign_up_screen.dart';
import '../../features/auth/forgot_password_screen.dart';
import '../../features/auth/reset_password_screen.dart';

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
import '../../features/quotes/quote_approval_screen.dart';
import '../../features/invoices/invoice_payment_screen.dart';

import '../../features/field/technician_tracking_screen.dart';
import '../../features/ai/ai_operations_assistant_screen.dart';
import '../../features/ai/ai_insight_detail_screen.dart';
import '../../features/settings/notifications_screen.dart';
import '../../features/settings/profile_settings_screen.dart';
import '../../features/settings/company_settings_screen.dart';
import '../../features/more/more_screen.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/dashboard',
  routes: [
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
      builder: (context, state) => const CreateInvoiceScreen(),
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
      path: '/quote-approval',
      builder: (context, state) => const QuoteApprovalScreen(),
    ),
    GoRoute(
      path: '/invoice-payment',
      builder: (context, state) => const InvoicePaymentScreen(),
    ),

    // Field & AI & Settings
    GoRoute(
      path: '/technician-tracking',
      builder: (context, state) => const TechnicianTrackingScreen(),
    ),
    GoRoute(
      path: '/ai-assistant',
      builder: (context, state) => const AiOperationsAssistantScreen(),
    ),
    GoRoute(
      path: '/ai-insight/:insightId',
      builder: (context, state) {
        final insightId = state.pathParameters['insightId'] ?? 'ins-1';
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

    // Sub-routes for Jobs & Customers Details
    GoRoute(
      path: '/jobs/:jobId',
      builder: (context, state) {
        final jobId = state.pathParameters['jobId'] ?? 'JOB-4019';
        return JobDetailScreen(jobId: jobId);
      },
    ),
    GoRoute(
      path: '/customers/:customerId',
      builder: (context, state) {
        final customerId = state.pathParameters['customerId'] ?? 'CUST-1002';
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
  ],
);
