import mongoose, {isValidObjectId} from "mongoose"
import {Video, User, Like, Comment} from "../models/index.js"
import {ApiError, ApiResponse, asyncHandler} from "../utils/index.js"
import {uploadOnCloudinary, deleteOnCloudinary} from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    const pipeline = []

    if (query) pipeline.push({ $search: { index: "search-videos", text: { query, path: ["title", "description"] } } })
    if (userId) {
        if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid userId")
        pipeline.push({ $match: { owner: new mongoose.Types.ObjectId(userId) } })
    }

    pipeline.push(
        { $match: { isPublished: true } },
        { $sort: sortBy && sortType ? { [sortBy]: sortType === "asc" ? 1 : -1 } : { createdAt: -1 } },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [{ $project: { username: 1, "avatar.url": 1 } }]
            }
        },
        { $unwind: "$ownerDetails" }
    )

    const options = { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    const video = await Video.aggregatePaginate(Video.aggregate(pipeline), options)
    return res.status(200).json(new ApiResponse(200, video, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    if (!title || !description) throw new ApiError(400, "Title and description are required")

    const videoFile = await uploadOnCloudinary(req.files?.videoFile[0]?.path)
    const thumbnail = await uploadOnCloudinary(req.files?.thumbnail[0]?.path)
    if (!videoFile || !thumbnail) throw new ApiError(400, "Video and thumbnail are required")

    const video = await Video.create({
        title, description, duration: videoFile.duration,
        videoFile: { url: videoFile.url, public_id: videoFile.public_id },
        thumbnail: { url: thumbnail.url, public_id: thumbnail.public_id },
        owner: req.user?._id, isPublished: false
    })

    return res.status(200).json(new ApiResponse(200, video, "Video uploaded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId) || !isValidObjectId(req.user?._id)) throw new ApiError(400, "Invalid ID")

    const [video] = await Video.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
        { $lookup: { from: "likes", localField: "_id", foreignField: "video", as: "likes" } },
        {
            $lookup: {
                from: "users", localField: "owner", foreignField: "_id", as: "owner",
                pipeline: [
                    { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribers" } },
                    {
                        $addFields: {
                            subscribersCount: { $size: "$subscribers" },
                            isSubscribed: { $in: [req.user?._id, "$subscribers.subscriber"] }
                        }
                    },
                    { $project: { username: 1, "avatar.url": 1, subscribersCount: 1, isSubscribed: 1 } }
                ]
            }
        },
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                owner: { $first: "$owner" },
                isLiked: { $in: [req.user?._id, "$likes.likedBy"] }
            }
        },
        { $project: { "videoFile.url": 1, title: 1, description: 1, views: 1, createdAt: 1, duration: 1, comments: 1, owner: 1, likesCount: 1, isLiked: 1 } }
    ])

    if (!video) throw new ApiError(404, "Video not found")
    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } })
    await User.findByIdAndUpdate(req.user?._id, { $addToSet: { watchHistory: videoId } })
    return res.status(200).json(new ApiResponse(200, video, "Video details fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId")
    if (!title || !description) throw new ApiError(400, "Title and description are required")

    const video = await Video.findById(videoId)
    if (!video) throw new ApiError(404, "Video not found")
    if (video.owner.toString() !== req.user?._id.toString()) throw new ApiError(400, "Unauthorized access")

    const thumbnail = await uploadOnCloudinary(req.file?.path)
    if (!thumbnail) throw new ApiError(400, "Thumbnail upload failed")

    const updatedVideo = await Video.findByIdAndUpdate(videoId, {
        $set: { title, description, thumbnail: { public_id: thumbnail.public_id, url: thumbnail.url } }
    }, { new: true })

    if (!updatedVideo) throw new ApiError(500, "Update failed")
    await deleteOnCloudinary(video.thumbnail.public_id)
    return res.status(200).json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId")

    const video = await Video.findById(videoId)
    if (!video) throw new ApiError(404, "Video not found")
    if (video.owner.toString() !== req.user?._id.toString()) throw new ApiError(400, "Unauthorized access")

    await Video.findByIdAndDelete(videoId)
    await Promise.all([
        deleteOnCloudinary(video.thumbnail.public_id),
        deleteOnCloudinary(video.videoFile.public_id, "video"),
        Like.deleteMany({ video: videoId }),
        Comment.deleteMany({ video: videoId })
    ])

    return res.status(200).json(new ApiResponse(200, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId")

    const video = await Video.findById(videoId)
    if (!video) throw new ApiError(404, "Video not found")
    if (video.owner.toString() !== req.user?._id.toString()) throw new ApiError(400, "Unauthorized access")

    const updatedVideo = await Video.findByIdAndUpdate(videoId, { $set: { isPublished: !video.isPublished } }, { new: true })
    return res.status(200).json(new ApiResponse(200, { isPublished: updatedVideo.isPublished }, "Publish status toggled"))
})

export { getAllVideos, publishAVideo, getVideoById, updateVideo, deleteVideo, togglePublishStatus }