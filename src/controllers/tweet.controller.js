import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { User } from "../models/user.model.js"
import { ApiError, ApiResponse, asyncHandler } from "../utils/index.js"

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body
    if (!content?.trim()) throw new ApiError(400, "Tweet content is required")

    const tweet = await Tweet.create({ content: content.trim(), owner: req.user._id })
    if (!tweet) throw new ApiError(500, "Failed to create tweet")

    return res.status(201).json(new ApiResponse(201, tweet, "Tweet created successfully"))
})

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params
    const { page = 1, limit = 10 } = req.query

    if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid user ID")
    if (!await User.findById(userId)) throw new ApiError(404, "User not found")

    const aggregatePipeline = [
        { $match: { owner: new mongoose.Types.ObjectId(userId) } },
        { 
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [{ $project: { username: 1, fullName: 1, avatar: 1 } }]
            }
        },
        { $lookup: { from: "likes", localField: "_id", foreignField: "tweet", as: "likes" } },
        { 
            $addFields: {
                likesCount: { $size: "$likes" },
                ownerDetails: { $first: "$ownerDetails" },
                isLiked: { $cond: { if: { $in: [req.user._id, "$likes.likedBy"] }, then: true, else: false } }
            }
        },
        { $sort: { createdAt: -1 } },
        { $project: { content: 1, ownerDetails: 1, likesCount: 1, createdAt: 1, isLiked: 1 } }
    ]

    const options = { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    const tweets = await Tweet.aggregatePaginate(Tweet.aggregate(aggregatePipeline), options)

    return res.status(200).json(new ApiResponse(200, tweets, "User tweets fetched successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    const { content } = req.body

    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweet ID")
    if (!content?.trim()) throw new ApiError(400, "Tweet content is required")

    const tweet = await Tweet.findById(tweetId)
    if (!tweet) throw new ApiError(404, "Tweet not found")
    if (tweet.owner.toString() !== req.user._id.toString()) throw new ApiError(403, "You can only edit your own tweets")

    const updatedTweet = await Tweet.findByIdAndUpdate(tweetId, { $set: { content: content.trim() } }, { new: true })
    return res.status(200).json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"))
})

const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweet ID")

    const tweet = await Tweet.findById(tweetId)
    if (!tweet) throw new ApiError(404, "Tweet not found")
    if (tweet.owner.toString() !== req.user._id.toString()) throw new ApiError(403, "You can only delete your own tweets")

    await Tweet.findByIdAndDelete(tweetId)
    return res.status(200).json(new ApiResponse(200, {}, "Tweet deleted successfully"))
})

export { createTweet, getUserTweets, updateTweet, deleteTweet }