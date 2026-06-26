import { Router } from "express";
import { AuthRoutes } from "../modules/auth/auth.routes";
import { UserRoutes } from "../modules/user/user.route";
import { AccommodationRoutes } from "../modules/accommodation/accommodation.routes";
import { AssignmentRoutes } from "../modules/assignment/assignment.routes";
import { ScheduleRoutes } from "../modules/schedule/schedule.routes";
import { ChatRoutes } from "../modules/chat/chat.routes";
import { NotificationRoutes } from "../modules/notification/notification.routes";
import { ContentRoutes } from "../modules/content/content.routes";
import { SupportRoutes } from "../modules/support/support.routes";
import { PaymentRoutes } from "../modules/payment/payment.routes";
import { AdminRoutes } from "../modules/admin/admin.routes";

const router = Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/user",
    route: UserRoutes,
  },
  {
    path: "/accommodation",
    route: AccommodationRoutes,
  },
  {
    path: "/assignment",
    route: AssignmentRoutes,
  },
  {
    path: "/schedule",
    route: ScheduleRoutes,
  },
  {
    path: "/chat",
    route: ChatRoutes,
  },
  {
    path: "/notification",
    route: NotificationRoutes,
  },
  {
    path: "/content",
    route: ContentRoutes,
  },
  {
    path: "/support",
    route: SupportRoutes,
  },
  {
    path: "/payment",
    route: PaymentRoutes,
  },
  {
    path: "/admin",
    route: AdminRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
