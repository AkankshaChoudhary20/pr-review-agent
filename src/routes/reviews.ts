import { Request, Response, Router } from "express";
import { getReviewById, listReviews } from "../repository.js";

export const reviewsRouter = Router();

reviewsRouter.get("/reviews", async (_req: Request, res: Response) => {
  try {
    const reviews = await listReviews();
    res.json(reviews);
  } catch (err) {
    console.error("[reviews] Failed to list reviews:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

reviewsRouter.get("/reviews/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid review id" });
    return;
  }

  try {
    const review = await getReviewById(id);
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }
    res.json(review);
  } catch (err) {
    console.error(`[reviews] Failed to fetch review ${id}:`, err);
    res.status(500).json({ error: "Failed to fetch review" });
  }
});
